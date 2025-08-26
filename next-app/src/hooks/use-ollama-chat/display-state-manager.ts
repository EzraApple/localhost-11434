import type { UIMessage } from '~/lib/chat-types'
import type { ChatStatus, StreamPhase, StreamChunk } from './utils'
import { updateMessagesWithStreamChunk, calculateReasoningDuration } from './utils'
import type { ToolCall } from '~/lib/tools/types'

export interface ReasoningEvent {
  type: 'text' | 'tool_call'
  timestamp: number
  content?: string
  toolCall?: ToolCall
}

export interface DisplayState {
  messages: UIMessage[]
  status: ChatStatus
  streamPhase: StreamPhase
  reasoningDurations: Record<string, number>
  currentAssistantId: string | null
  reasoningStart: number | null
  reasoningToolCalls?: Map<string, ToolCall>  // Optional for backward compatibility
  responseToolCalls?: Map<string, ToolCall>   // Optional for backward compatibility
  reasoningTimeline?: ReasoningEvent[]        // New timeline for inline rendering
  responseTimeline?: ReasoningEvent[]         // New timeline for response phase
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
      reasoningTimeline: [],
      responseTimeline: [],
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
    // When starting a new assistant message, clear previous tool calls and timelines
    if (id && id !== this.displayState.currentAssistantId) {
      console.log('[DisplayManager] Starting new assistant message, clearing previous tool calls and timelines');
      if (this.displayState.reasoningToolCalls) {
        this.displayState.reasoningToolCalls.clear();
      }
      if (this.displayState.responseToolCalls) {
        this.displayState.responseToolCalls.clear();
      }
      // Clear timelines for new message
      this.displayState.reasoningTimeline = [];
      this.displayState.responseTimeline = [];
    }
    this.displayState.currentAssistantId = id
  }

  setReasoningStart(start: number | null): void {
    this.displayState.reasoningStart = start
  }

  // === Streaming Updates ===

  updateStreamingMessage(chunk: StreamChunk, assistantId: string): void {
    // Ensure tool call Maps and timelines are initialized
    if (!this.displayState.reasoningToolCalls) {
      this.displayState.reasoningToolCalls = new Map();
    }
    if (!this.displayState.responseToolCalls) {
      this.displayState.responseToolCalls = new Map();
    }
    if (!this.displayState.reasoningTimeline) {
      this.displayState.reasoningTimeline = [];
    }
    if (!this.displayState.responseTimeline) {
      this.displayState.responseTimeline = [];
    }

    // Handle tool calls
    if (chunk.kind === 'tool_call' && chunk.toolCall) {
      const { toolCall } = chunk;
      const toolCallData: ToolCall = {
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
        state: 'input-available',
        phase: toolCall.phase,
      };

      console.log('[DisplayManager] Processing tool call:', toolCallData);

      if (toolCall.phase === 'reasoning') {
        this.displayState.reasoningToolCalls.set(toolCall.id, toolCallData);
        // Add to reasoning timeline
        this.displayState.reasoningTimeline.push({
          type: 'tool_call',
          timestamp: Date.now(),
          toolCall: toolCallData
        });
        console.log('[DisplayManager] Added reasoning tool call, total:', this.displayState.reasoningToolCalls.size);
      } else {
        this.displayState.responseToolCalls.set(toolCall.id, toolCallData);
        // Add to response timeline  
        this.displayState.responseTimeline.push({
          type: 'tool_call',
          timestamp: Date.now(),
          toolCall: toolCallData
        });
        console.log('[DisplayManager] Added response tool call, total:', this.displayState.responseToolCalls.size);
      }
      this.notifyStateChange();
      return;
    }

    // Handle tool results
    if (chunk.kind === 'tool_result' && chunk.toolResult) {
      const { toolResult } = chunk;
      console.log('[DisplayManager] Processing tool result:', toolResult);
      
      const targetMap = toolResult.phase === 'reasoning' 
        ? this.displayState.reasoningToolCalls 
        : this.displayState.responseToolCalls;
      
      const targetTimeline = toolResult.phase === 'reasoning'
        ? this.displayState.reasoningTimeline
        : this.displayState.responseTimeline;
      
      // Ensure target map exists
      if (targetMap) {
        const existing = targetMap.get(toolResult.id);
        console.log('[DisplayManager] Looking for tool call with ID:', toolResult.id);
        console.log('[DisplayManager] Available tool call IDs:', Array.from(targetMap.keys()));
        
        if (existing) {
          const updated: ToolCall = {
            ...existing,
            result: toolResult.result,
            error: toolResult.error,
            state: toolResult.error ? 'output-error' : 'output-available'
          };
          console.log('[DisplayManager] Updating tool call with result:', updated);
          targetMap.set(toolResult.id, updated);
          
          // Update the existing tool call in the timeline
          if (targetTimeline) {
            const toolCallIndex = targetTimeline.findIndex(
              event => event.type === 'tool_call' && event.toolCall?.id === toolResult.id
            );
            if (toolCallIndex !== -1) {
              // Update the tool call in place
              targetTimeline[toolCallIndex] = {
                ...targetTimeline[toolCallIndex]!,
                toolCall: updated
              };
              console.log('[DisplayManager] Updated tool call in timeline at index:', toolCallIndex);
            } else {
              console.log('[DisplayManager] ❌ Tool call not found in timeline for result ID:', toolResult.id);
            }
          }
          
          this.notifyStateChange();
        } else {
          console.log('[DisplayManager] ❌ Tool call not found for result ID:', toolResult.id);
          console.log('[DisplayManager] Available tool calls:', Array.from(targetMap.values()));
        }
      }
      return;
    }

    // Handle stream continuation
    if (chunk.kind === 'stream_continue') {
      // Just notify - don't reset anything, preserve all tool calls
      console.log('[DisplayManager] Stream continuing, preserving tool calls:', {
        reasoning: this.displayState.reasoningToolCalls?.size || 0,
        response: this.displayState.responseToolCalls?.size || 0
      });
      this.notifyStateChange();
      return;
    }

    if (chunk.kind !== 'reasoning' && chunk.kind !== 'text') return

    // Add reasoning text to timeline
    if (chunk.kind === 'reasoning' && chunk.text) {
      this.displayState.reasoningTimeline?.push({
        type: 'text',
        timestamp: Date.now(),
        content: chunk.text
      });
    }

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
    
    // DON'T clear tool calls here - they should persist until the next message
    console.log('[DisplayManager] Finalized reasoning, preserving tool calls:', {
      reasoning: this.getReasoningToolCalls().length,
      response: this.getResponseToolCalls().length
    });
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
      reasoningToolCalls: new Map(),
      responseToolCalls: new Map(),
      reasoningTimeline: [],
      responseTimeline: [],
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

  // === Tool Call Access ===

  getReasoningToolCalls(): ToolCall[] {
    // Defensive initialization for backward compatibility
    if (!this.displayState.reasoningToolCalls) {
      this.displayState.reasoningToolCalls = new Map();
    }
    const calls = Array.from(this.displayState.reasoningToolCalls.values());
    console.log('[DisplayManager] Getting reasoning tool calls:', calls.length, calls);
    return calls;
  }

  getResponseToolCalls(): ToolCall[] {
    // Defensive initialization for backward compatibility
    if (!this.displayState.responseToolCalls) {
      this.displayState.responseToolCalls = new Map();
    }
    const calls = Array.from(this.displayState.responseToolCalls.values());
    console.log('[DisplayManager] Getting response tool calls:', calls.length, calls);
    return calls;
  }

  getAllToolCalls(): ToolCall[] {
    return [
      ...this.getReasoningToolCalls(),
      ...this.getResponseToolCalls()
    ]
  }

  clearToolCalls(): void {
    // Ensure tool call Maps are initialized before clearing
    if (!this.displayState.reasoningToolCalls) {
      this.displayState.reasoningToolCalls = new Map();
    }
    if (!this.displayState.responseToolCalls) {
      this.displayState.responseToolCalls = new Map();
    }
    
    this.displayState.reasoningToolCalls.clear();
    this.displayState.responseToolCalls.clear();
    this.notifyStateChange();
  }

  // === Timeline Access ===

  getReasoningTimeline(): ReasoningEvent[] {
    return this.displayState.reasoningTimeline || []
  }

  getResponseTimeline(): ReasoningEvent[] {
    return this.displayState.responseTimeline || []
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
      reasoningTimelineLength: this.displayState.reasoningTimeline?.length || 0,
      responseTimelineLength: this.displayState.responseTimeline?.length || 0,
    }
  }
}
