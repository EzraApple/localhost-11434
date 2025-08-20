export type UIMessagePart =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }

export type UIMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: UIMessagePart[]
}


