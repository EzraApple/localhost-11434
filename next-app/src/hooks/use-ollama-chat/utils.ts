import type { UIMessage } from '~/lib/chat-types'
import { toast } from 'sonner'

// Types for internal use
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'
export type StreamPhase = 'idle' | 'reasoning' | 'answer'

export interface StreamChunk {
  kind: 'reasoning' | 'text' | 'error' | 'done' | 'tool_call' | 'tool_result' | 'stream_continue'
  text?: string
  error?: string
  toolCall?: {
    id: string
    name: string
    arguments: Record<string, any>
    phase: 'reasoning' | 'response'
  }
  toolResult?: {
    id: string
    result?: any
    error?: string
    phase: 'reasoning' | 'response'
  }
  isContinuation?: boolean
}

export interface ChatSubmitParams {
  text: string
  model: string
  reasoningLevel?: 'low' | 'medium' | 'high'
  systemPromptContent?: string
  images?: Array<{ data: string; mimeType: string; fileName: string }>
  userMessage?: UIMessage // Structured message with file parts
}

export interface SubmitHistoryParams {
  text: string
  model: string
  history: UIMessage[]
  systemPromptContent?: string
  userMessageId?: string
  images?: Array<{ data: string; mimeType: string; fileName: string }>
}

// Message transformation utilities
export function convertDbToUiMessages(dbMessages: any[]): UIMessage[] {
  return dbMessages.map(m => ({
    id: m.id,
    role: String(m.role).toLowerCase() as UIMessage['role'],
    parts: (m.parts as any[]) as UIMessage['parts'],
  }))
}

export function convertUiToApiMessages(uiMessages: UIMessage[]): any[] {
  return uiMessages.map((m) => {
    const textParts = m.parts.filter(p => p.type === 'text')
    const imageParts = m.parts.filter(p => p.type === 'image')
    const content = textParts.map((p) => p.text).join(' ')
    const message: any = { role: m.role, content }

    // Add images for this message if it has any
    if (m.role === 'user' && imageParts.length > 0) {
      message.images = imageParts.map(img => img.data)
    }

    return message
  })
}

export function createUserMessage(
  text: string, 
  images?: Array<{ data: string; mimeType: string; fileName: string }>
): UIMessage {
  const parts: UIMessage['parts'] = [{ type: 'text', text }]
  if (images && images.length > 0) {
    parts.push(...images.map(img => ({ 
      type: 'image' as const, 
      data: img.data, 
      mimeType: img.mimeType, 
      fileName: img.fileName 
    })))
  }
  return {
    id: crypto.randomUUID(),
    role: 'user',
    parts,
  }
}

export function createDbMessageParts(
  text: string,
  images?: Array<{ data: string; mimeType: string; fileName: string }>,
  userMessage?: UIMessage
): any[] {
  // If we have a structured user message, use its parts
  if (userMessage?.parts) {
    return userMessage.parts.map(part => ({
      type: part.type,
      text: part.type === 'text' ? part.text : undefined,
      data: part.type === 'image' || part.type === 'file' ? part.data : undefined,
      mimeType: part.type === 'image' || part.type === 'file' ? part.mimeType : undefined,
      fileName: part.type === 'image' || part.type === 'file' ? part.fileName : undefined,
      content: part.type === 'file' ? part.content : undefined,
      fileType: part.type === 'file' ? part.fileType : undefined,
    }))
  }
  
  // Fallback to legacy format
  const parts = [{ type: 'text', text }] as any
  if (images && images.length > 0) {
    parts.push(...images.map(img => ({ 
      type: 'image', 
      data: img.data, 
      mimeType: img.mimeType, 
      fileName: img.fileName 
    })))
  }
  return parts
}

export function extractImagesFromMessage(message: UIMessage): Array<{ data: string; mimeType: string; fileName: string }> | undefined {
  const imageParts = message.parts.filter(p => p.type === 'image')
  return imageParts.length > 0 
    ? imageParts.map(p => ({ 
        data: p.data, 
        mimeType: p.mimeType, 
        fileName: p.fileName || 'image' 
      })) 
    : undefined
}

export function findUserTextFromMessage(message: UIMessage): string | undefined {
  return message.parts.find(p => p.type === 'text')?.text
}

// State management utilities
export function shouldPreserveUiState(
  dbMessages: UIMessage[], 
  uiMessages: UIMessage[], 
  status: ChatStatus
): boolean {
  // More precise hydration logic:
  // 1. If DB is empty and UI is empty -> use DB (empty state)
  // 2. If DB has data -> always use DB (normal case, even if UI has unsaved changes)
  // 3. If DB is empty but UI has messages -> only preserve UI if we're currently streaming
  if (dbMessages.length > 0) {
    return false // Always sync to DB when DB has data
  } else if (uiMessages.length === 0 || status === 'ready') {
    return false // Use DB when UI is empty or not streaming
  }
  return true // Preserve UI state when streaming
}

export function resetChatState() {
  return {
    messages: [],
    status: 'ready' as ChatStatus,
    streamPhase: 'idle' as StreamPhase,
    reasoningDurations: {},
    currentAssistantId: null,
    reasoningStart: null,
  }
}

// Streaming utilities
export function parseStreamLine(line: string): StreamChunk | null {
  if (!line) return null
  try {
    return JSON.parse(line) as StreamChunk
  } catch {
    return null
  }
}

export function updateMessagesWithStreamChunk(
  messages: UIMessage[],
  chunk: StreamChunk,
  currentAssistantId: string,
  streamPhase: StreamPhase
): { 
  updatedMessages: UIMessage[], 
  updatedPhase: StreamPhase,
  shouldUpdatePhase: boolean 
} {
  // Handle tool calls and results - don't update messages directly as they're managed by DisplayStateManager
  if (chunk.kind === 'tool_call' || chunk.kind === 'tool_result' || chunk.kind === 'stream_continue') {
    return { 
      updatedMessages: messages, 
      updatedPhase: streamPhase,
      shouldUpdatePhase: false 
    }
  }

  if (chunk.kind !== 'reasoning' && chunk.kind !== 'text') {
    return { 
      updatedMessages: messages, 
      updatedPhase: streamPhase,
      shouldUpdatePhase: false 
    }
  }

  const kind = chunk.kind as 'reasoning' | 'text'
  const textDelta = String(chunk.text ?? '')
  const shouldUpdatePhase = kind === 'text' && streamPhase !== 'answer'

  const next = [...messages]
  const lastMessage = next[next.length - 1]
  const needsNewAssistantMessage = next.length === 0 || 
    lastMessage?.role !== 'assistant' || 
    lastMessage?.id !== currentAssistantId
  
  if (needsNewAssistantMessage) {
    next.push({ id: currentAssistantId, role: 'assistant', parts: [] })
  }
  
  const lastIndex = next.length - 1
  const lastMsg = next[lastIndex]!
  const parts = lastMsg.parts.slice()
  const lastPart = parts[parts.length - 1]
  
  if (lastPart && lastPart.type === kind) {
    parts[parts.length - 1] = { ...lastPart, text: lastPart.text + textDelta }
  } else {
    parts.push({ type: kind, text: textDelta })
  }
  
  next[lastIndex] = { ...lastMsg, parts }

  return {
    updatedMessages: next,
    updatedPhase: shouldUpdatePhase ? 'answer' : streamPhase,
    shouldUpdatePhase
  }
}

export function calculateReasoningDuration(startTime: number): number {
  return Math.max(0, Math.round((Date.now() - startTime) / 1000))
}

// API utilities
export function prepareApiPayload(params: {
  model: string
  messages: any[]
  systemPromptContent?: string
  reasoningLevel?: 'low' | 'medium' | 'high'
  chatId: string
  assistantMessageId: string
  userMessageId?: string
}): any {
  const combinedMessages = [
    ...(params.systemPromptContent ? [{ role: 'system' as const, content: params.systemPromptContent }] : []),
    ...params.messages,
  ]

  return {
    model: params.model,
    messages: combinedMessages,
    think: params.reasoningLevel ? params.reasoningLevel : false,
    reasoningLevel: params.reasoningLevel,
    chatId: params.chatId,
    assistantMessageId: params.assistantMessageId,
    userMessageId: params.userMessageId,
  }
}

export function prepareSubmitHistoryPayload(params: {
  model: string
  history: UIMessage[]
  text: string
  systemPromptContent?: string
  images?: Array<{ data: string; mimeType: string; fileName: string }>
  chatId: string
  assistantMessageId: string
  userMessageId?: string
}): any {
  const baseHistory = convertUiToApiMessages(params.history)
  
  const combinedMessages = [
    ...(params.systemPromptContent ? [{ role: 'system' as const, content: params.systemPromptContent }] : []),
    ...baseHistory,
    // Only add user message if it's not already in the history (for new messages, not edits)
    ...(params.text && !baseHistory.some(m => m.role === 'user' && m.content === params.text)
      ? [{
          role: 'user' as const,
          content: params.text,
          ...(params.images && params.images.length > 0 ? { images: params.images.map(img => img.data) } : {})
        }]
      : []),
  ]

  return {
    model: params.model,
    messages: combinedMessages,
    think: false, // Can be enhanced later
    chatId: params.chatId,
    assistantMessageId: params.assistantMessageId,
    userMessageId: params.userMessageId,
  }
}

export async function fetchChatStream(payload: any, signal: AbortSignal): Promise<Response> {
  const res = await fetch('/api/ollama/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    signal,
  })

  if (!res.ok || !res.body) {
    // Import parseApiErrorResponse dynamically to avoid circular imports
    const { parseApiErrorResponse } = await import('./error-handlers')
    const ollamaError = await parseApiErrorResponse(res)
    throw new Error(ollamaError.userMessage)
  }

  return res
}

// Stream processing utilities
export async function* processStreamReader(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<StreamChunk> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    let index
    
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      
      const chunk = parseStreamLine(line)
      if (chunk) {
        yield chunk
      }
    }
  }
}

// Error handling utilities
export function handleStreamError(error: unknown): void {
  const msg = error instanceof Error ? error.message : 'Unknown error'
  toast.error('Chat error', { description: msg })
}

export function handleFetchError(error: unknown): void {
  const msg = error instanceof Error ? error.message : 'Unknown error'
  toast.error('Chat failed', { description: msg })
}

export function handleStreamingError(error: string): void {
  toast.error('Streaming error', { description: error || 'An unknown streaming error occurred' })
}

// Validation utilities
export function validateSubmitParams(params: ChatSubmitParams): boolean {
  return !!params.text.trim()
}

export function messageAlreadyExists(messages: UIMessage[], text: string): boolean {
  return messages.some(m => m.role === 'user' && m.parts.find(p => p.type === 'text')?.text === text)
}

// Debug utilities
export function logPayload(payload: any, context: string): void {
  console.log(`[chat] ${context} payload:`, {
    model: payload.model,
    messageCount: payload.messages.length,
    messages: payload.messages.map((m: any) => ({
      role: m.role,
      content: m.content?.substring(0, 100) + (m.content && m.content.length > 100 ? '...' : ''),
      hasImages: !!(m as any).images?.length,
      imageCount: (m as any).images?.length || 0
    }))
  })
}
