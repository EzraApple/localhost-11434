'use client'

import { useEffect, useMemo, useState, type FormEventHandler } from 'react'
import { Brain } from 'lucide-react'
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
import { useOllamaModelCapabilities } from '~/hooks/use-ollama-model-capabilities'
import { toast } from 'sonner'

type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

export type ChatInputModel = { name: string }

export type ChatInputProps = {
  models: ChatInputModel[]
  defaultModel?: string
  placeholder?: string
  prefillText?: string
  onSubmit?: (payload: { text: string; model: string; reasoningLevel: 'low' | 'medium' | 'high' }) => void
  placement?: 'viewport' | 'container' | 'page'
  maxWidthClass?: string
}

export function ChatInput({ models, defaultModel, placeholder = 'Type your message…', prefillText, onSubmit, placement = 'viewport', maxWidthClass = 'max-w-3xl' }: ChatInputProps) {
  const [text, setText] = useState('')
  const [model, setModel] = useState('')
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [reasoningLevel, setReasoningLevel] = useState<'low' | 'medium' | 'high'>('high')
  const { data: caps, error: capsError, thinkLevels } = useOllamaModelCapabilities(model)

  const effectiveDefault = useMemo(() => defaultModel ?? models[0]?.name ?? '', [defaultModel, models])

  useEffect(() => {
    if (!model && effectiveDefault) setModel(effectiveDefault)
  }, [effectiveDefault, model])

  // apply prefill text when provided
  useEffect(() => {
    if (typeof prefillText === 'string') setText(prefillText)
  }, [prefillText])

  // adjust reasoning level to a supported one when model changes
  useEffect(() => {
    if (!model) return
    if (thinkLevels.size === 0) {
      // no think support; clear selection by setting to 'high' but we will not send it
      setReasoningLevel('high')
      return
    }
    if (!thinkLevels.has(reasoningLevel)) {
      // pick highest available level
      const pick = (thinkLevels.has('high') && 'high') || (thinkLevels.has('medium') && 'medium') || 'low'
      setReasoningLevel(pick as any)
    }
  }, [model, thinkLevels])

  useEffect(() => {
    if (capsError) toast.error('Model capabilities error', { description: String((capsError as any)?.message || capsError) })
  }, [capsError])

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    if (!text.trim()) return
    // bubble up
    // if model doesn't support think, pass undefined to avoid enabling think
    const rl = thinkLevels.size > 0 && thinkLevels.has(reasoningLevel) ? reasoningLevel : undefined
    onSubmit?.({ text, model, reasoningLevel: rl as any })
    // temporary internal status handling (will be parent-controlled later)
    setStatus('submitted')
    setTimeout(() => setStatus('streaming'), 200)
    setTimeout(() => {
      setStatus('ready')
      setText('')
    }, 2000)
  }

  return (
    <div className={
      placement === 'viewport'
        ? "pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4"
        : placement === 'container'
          ? "pointer-events-none sticky bottom-0 z-40 px-4"
          : "pointer-events-none absolute inset-x-0 bottom-0 z-40 px-4"
    }>
      <div className={`mx-auto w-full ${maxWidthClass}`}>
        <div className="border border-[#113936]/40 rounded-t-[20px] bg-transparent backdrop-blur-lg shadow-[0_80px_50px_0_rgba(0,0,0,0.1),0_50px_30px_0_rgba(0,0,0,0.07),0_30px_15px_0_rgba(0,0,0,0.06),0_15px_8px_rgba(0,0,0,0.04),0_6px_4px_rgba(0,0,0,0.04),0_2px_2px_rgba(0,0,0,0.02)] p-2 pb-0 pointer-events-auto">
          <PromptInput onSubmit={handleSubmit} className="mb-4 text-[#cfd6d4] bg-[#132524f0]">
            <PromptInputTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
            />
            <PromptInputToolbar>
              <div className="flex items-center gap-2">
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
                {thinkLevels.size > 0 && (
                  <PromptInputModelSelect onValueChange={(v) => setReasoningLevel(v as any)} value={reasoningLevel}>
                    <PromptInputModelSelectTrigger className="h-8">
                      <PromptInputModelSelectValue>
                        <div className="inline-flex items-center gap-1 text-xs">
                          <Brain className="h-3.5 w-3.5" />
                          <span className="capitalize">{reasoningLevel}</span>
                        </div>
                      </PromptInputModelSelectValue>
                    </PromptInputModelSelectTrigger>
                    <PromptInputModelSelectContent>
                      {(['low','medium','high'] as const).filter(level => thinkLevels.has(level)).map(level => (
                        <PromptInputModelSelectItem key={level} value={level}>
                          <span className="capitalize">{level}</span>
                        </PromptInputModelSelectItem>
                      ))}
                    </PromptInputModelSelectContent>
                  </PromptInputModelSelect>
                )}
              </div>
              <div />
              <PromptInputSubmit disabled={!text} status={status} />
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>
    </div>
  )
}

export default ChatInput


