export type UIMessagePart =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string; fileName?: string }
  | { type: 'file'; data: string; mimeType: string; fileName: string; content?: string; fileType?: string }

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


