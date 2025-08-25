export type UIMessagePart =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string; fileName?: string }
  | { type: 'file'; data: string; mimeType: string; fileName: string; content?: string; fileType?: string }
  | { type: 'tool_call'; toolName: string; arguments: Record<string, any>; callId: string; state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'; phase: 'reasoning' | 'response' }
  | { type: 'tool_result'; toolName: string; callId: string; result?: any; error?: string; phase: 'reasoning' | 'response' }

export type UIMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: UIMessagePart[]
  metadata?: {
    isError?: boolean
    retryable?: boolean
    [key: string]: any
  }
}


