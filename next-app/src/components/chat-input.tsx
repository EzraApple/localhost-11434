'use client'

import { useEffect, useMemo, useState, type FormEventHandler } from 'react'
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
} from '~/components/ai-elements/prompt-input'

type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

export type ChatInputModel = { name: string }

export type ChatInputProps = {
  models: ChatInputModel[]
  defaultModel?: string
  placeholder?: string
  onSubmit?: (payload: { text: string; model: string }) => void
}

export function ChatInput({ models, defaultModel, placeholder = 'Type your message…', onSubmit }: ChatInputProps) {
  const [text, setText] = useState('')
  const [model, setModel] = useState('')
  const [status, setStatus] = useState<ChatStatus>('ready')

  const effectiveDefault = useMemo(() => defaultModel ?? models[0]?.name ?? '', [defaultModel, models])

  useEffect(() => {
    if (!model && effectiveDefault) setModel(effectiveDefault)
  }, [effectiveDefault, model])

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    if (!text.trim()) return
    // bubble up
    onSubmit?.({ text, model })
    // temporary internal status handling (will be parent-controlled later)
    setStatus('submitted')
    setTimeout(() => setStatus('streaming'), 200)
    setTimeout(() => {
      setStatus('ready')
      setText('')
    }, 2000)
  }

  return (
    <PromptInput onSubmit={handleSubmit}>
      <PromptInputTextarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
      />
      <PromptInputToolbar>
        <PromptInputModelSelect onValueChange={setModel} value={model}>
          <PromptInputModelSelectTrigger className="h-8">
            <PromptInputModelSelectValue />
          </PromptInputModelSelectTrigger>
          <PromptInputModelSelectContent>
            {models.map((m) => (
              <PromptInputModelSelectItem key={m.name} value={m.name}>
                {m.name}
              </PromptInputModelSelectItem>
            ))}
          </PromptInputModelSelectContent>
        </PromptInputModelSelect>
        <div />
        <PromptInputSubmit disabled={!text} status={status} />
      </PromptInputToolbar>
    </PromptInput>
  )
}

export default ChatInput


