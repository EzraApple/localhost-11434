import type { UIMessage } from '~/lib/chat-types'
import type { ChatStatus, StreamPhase, StreamChunk } from './utils'
import { updateMessagesWithStreamChunk, calculateReasoningDuration } from './utils'

export interface DisplayState {
  messages: UIMessage[]
  status: ChatStatus
  streamPhase: StreamPhase
  reasoningDurations: Record<string, number>
  currentAssistantId: string | null
  reasoningStart: number | null
}

export class DisplayStateManager {
  private displayState: DisplayState
  private persistedState: UIMessage[]
  private chatId: string

  constructor(chatId: string) {
    this.chatId = chatId
    this.displayState = {
      messages: [],
      status: 'ready',
      streamPhase: 'idle',
      reasoningDurations: {},
      currentAssistantId: null,
      reasoningStart: null,
    }
    this.persistedState = []
  }

  // === Immediate UI Updates ===

  addUserMessage(message: UIMessage): void {
    this.displayState.messages = [...this.displayState.messages, message]
    this.notifyStateChange()
  }

  removeMessagesAfter(messageId: string): UIMessage[] {
    const messageIndex = this.displayState.messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) return []
    
    const removedMessages = this.displayState.messages.slice(messageIndex)
    this.displayState.messages = this.displayState.messages.slice(0, messageIndex)
    this.notifyStateChange()
    return removedMessages
  }

  replaceMessagesFromIndex(index: number, newMessages: UIMessage[]): void {
    this.displayState.messages = [
      ...this.displayState.messages.slice(0, index),
      ...newMessages
    ]
    this.notifyStateChange()
  }

  setStatus(status: ChatStatus): void {
    this.displayState.status = status
    this.notifyStateChange()
  }

  setStreamPhase(phase: StreamPhase): void {
    this.displayState.streamPhase = phase
    this.notifyStateChange()
  }

  setCurrentAssistantId(id: string | null): void {
    this.displayState.currentAssistantId = id
  }

  setReasoningStart(start: number | null): void {
    this.displayState.reasoningStart = start
  }

  // === Streaming Updates ===

  updateStreamingMessage(chunk: StreamChunk, assistantId: string): void {
    if (chunk.kind !== 'reasoning' && chunk.kind !== 'text') return

    const result = updateMessagesWithStreamChunk(
      this.displayState.messages,
      chunk,
      assistantId,
      this.displayState.streamPhase
    )

    this.displayState.messages = result.updatedMessages
    
    if (result.shouldUpdatePhase) {
      this.displayState.streamPhase = result.updatedPhase
    }

    // Start reasoning timer if needed
    if (chunk.kind === 'reasoning' && this.displayState.reasoningStart === null) {
      this.displayState.reasoningStart = Date.now()
    }

    this.notifyStateChange()
  }

  finalizeReasoning(): void {
    if (this.displayState.currentAssistantId && this.displayState.reasoningStart !== null) {
      const seconds = calculateReasoningDuration(this.displayState.reasoningStart)
      this.displayState.reasoningDurations = {
        ...this.displayState.reasoningDurations,
        [this.displayState.currentAssistantId]: seconds
      }
    }
    this.displayState.currentAssistantId = null
    this.displayState.reasoningStart = null
  }

  // === Error Handling ===

  addErrorMessage(error: string, isRetryable: boolean = true): void {
    // Remove any existing error messages first
    this.removeErrorMessages()

    const errorMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      parts: [{
        type: 'text',
        text: error
      }],
      metadata: { isError: true, retryable: isRetryable }
    }

    this.displayState.messages = [...this.displayState.messages, errorMessage]
    this.displayState.status = 'error'
    this.displayState.streamPhase = 'idle'
    this.notifyStateChange()
  }

  removeErrorMessages(): void {
    const hasErrorMessages = this.displayState.messages.some(m => 
      (m as any).metadata?.isError
    )
    
    if (hasErrorMessages) {
      this.displayState.messages = this.displayState.messages.filter(m => 
        !(m as any).metadata?.isError
      )
      this.notifyStateChange()
    }
  }

  // === State Hydration ===

  hydrate(dbMessages: UIMessage[]): void {
    this.persistedState = [...dbMessages]
    
    if (this.shouldUseDbState(dbMessages)) {
      this.displayState.messages = [...dbMessages]
      this.notifyStateChange()
    }
  }

  private shouldUseDbState(dbMessages: UIMessage[]): boolean {
    // During streaming, preserve display state to maintain real-time updates
    if (this.displayState.status === 'streaming' || this.displayState.status === 'submitted') {
      return false
    }

    // If display state is empty, use DB state
    if (this.displayState.messages.length === 0) {
      return true
    }

    // If DB has more messages than display state, use DB (catch up scenario)
    if (dbMessages.length > this.displayState.messages.length) {
      return true
    }

    // If display state has error messages, allow DB to override
    const hasErrorMessages = this.displayState.messages.some(m => 
      (m as any).metadata?.isError
    )
    if (hasErrorMessages && dbMessages.length >= this.displayState.messages.length - 1) {
      return true
    }

    // If we're in ready state and DB state differs significantly, use DB
    if (this.displayState.status === 'ready') {
      const dbLength = dbMessages.length
      const displayLength = this.displayState.messages.length
      
      // Allow some tolerance for optimistic messages
      if (Math.abs(dbLength - displayLength) > 1) {
        return true
      }
    }

    // Otherwise, keep display state
    return false
  }

  // === State Access ===

  getDisplayState(): DisplayState {
    return { ...this.displayState }
  }

  getMessages(): UIMessage[] {
    return [...this.displayState.messages]
  }

  getStatus(): ChatStatus {
    return this.displayState.status
  }

  getStreamPhase(): StreamPhase {
    return this.displayState.streamPhase
  }

  getReasoningDurations(): Record<string, number> {
    return { ...this.displayState.reasoningDurations }
  }

  getCurrentAssistantId(): string | null {
    return this.displayState.currentAssistantId
  }

  getReasoningStart(): number | null {
    return this.displayState.reasoningStart
  }

  // === State Synchronization ===

  markAsPersisted(messageId: string): void {
    // Update persisted state to include the message
    const message = this.displayState.messages.find(m => m.id === messageId)
    if (message && !this.persistedState.find(m => m.id === messageId)) {
      this.persistedState = [...this.persistedState, message]
    }
  }

  // === Reset ===

  reset(): void {
    this.displayState = {
      messages: [],
      status: 'ready',
      streamPhase: 'idle',
      reasoningDurations: {},
      currentAssistantId: null,
      reasoningStart: null,
    }
    this.persistedState = []
    this.notifyStateChange()
  }

  // === Change Notification ===
  private changeListeners = new Set<() => void>()

  onStateChange(listener: () => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  private notifyStateChange(): void {
    this.changeListeners.forEach(listener => listener())
  }

  // === Utility Methods ===

  findMessageIndex(messageId: string): number {
    return this.displayState.messages.findIndex(m => m.id === messageId)
  }

  getMessage(messageId: string): UIMessage | undefined {
    return this.displayState.messages.find(m => m.id === messageId)
  }

  getLastMessage(): UIMessage | undefined {
    return this.displayState.messages[this.displayState.messages.length - 1]
  }

  hasErrorMessages(): boolean {
    return this.displayState.messages.some(m => (m as any).metadata?.isError)
  }

  // === Debug Info ===
  getDebugInfo() {
    return {
      displayMessagesCount: this.displayState.messages.length,
      persistedMessagesCount: this.persistedState.length,
      status: this.displayState.status,
      streamPhase: this.displayState.streamPhase,
      hasErrors: this.hasErrorMessages(),
      chatId: this.chatId,
    }
  }
}
