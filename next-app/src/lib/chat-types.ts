export type UIMessagePart =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string; fileName?: string }

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


