'use client'

import { useEffect, useMemo, useRef, useState, type FormEventHandler } from 'react'
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
import { api } from '~/trpc/react'
import { toast } from 'sonner'

type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

export type ChatInputModel = { name: string }

export type ChatInputProps = {
  models: ChatInputModel[]
  defaultModel?: string
  chatId?: string
  defaultSystemPromptId?: string
  placeholder?: string
  prefillText?: string
  onSubmit?: (payload: { text: string; model: string; reasoningLevel: 'low' | 'medium' | 'high'; systemPromptContent?: string; systemPromptId?: string | 'none' }) => void
  onStop?: () => void
  onTypingStart?: () => void
  onTypingStop?: () => void
  autoClear?: boolean
  initialAutoSubmit?: boolean
  status?: ChatStatus
  placement?: 'viewport' | 'container' | 'page'
  maxWidthClass?: string
}

export function ChatInput({ models, defaultModel, chatId, defaultSystemPromptId, placeholder = 'Type your message…', prefillText, onSubmit, onStop, onTypingStart, onTypingStop, autoClear = true, initialAutoSubmit = false, status: externalStatus, placement = 'viewport', maxWidthClass = 'max-w-3xl' }: ChatInputProps) {
  const [text, setText] = useState('')
  const [model, setModel] = useState('')
  const hasCalledTypingStart = useRef(false)
  const isTextFromPrefill = useRef(false)
  const isInitialAutoSubmit = useRef(initialAutoSubmit)
  const status = externalStatus ?? 'ready'
  const [reasoningLevel, setReasoningLevel] = useState<'low' | 'medium' | 'high'>('high')
  const { data: caps, error: capsError, thinkLevels } = useOllamaModelCapabilities(model)
  const { data: promptData } = api.systemPrompts.list.useQuery(undefined, { refetchOnWindowFocus: false })
  const systemPrompts = promptData?.prompts ?? []
  const [systemPromptId, setSystemPromptId] = useState<string>('none')

  // initialize and persist selected system prompt (like model)
  useEffect(() => {
    try {
      const perChatKey = chatId ? `ollama:chat:${chatId}:systemPromptId` : null
      const globalKey = 'ollama:selectedSystemPromptId'
      const tryDefault = defaultSystemPromptId
      const isValid = (val: string | undefined | null) => !!val && (val === 'none' || systemPrompts.some((p: any) => p.id === val))
      const fromDefault = isValid(tryDefault) ? (tryDefault as string) : null
      const fromPerChat = isValid(perChatKey ? localStorage.getItem(perChatKey) : null) ? (localStorage.getItem(perChatKey as string) as string) : null
      const fromGlobal = isValid(localStorage.getItem(globalKey)) ? (localStorage.getItem(globalKey) as string) : null
      const next = fromDefault ?? fromPerChat ?? fromGlobal ?? 'none'
      if (next !== systemPromptId) setSystemPromptId(next)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptData, chatId, defaultSystemPromptId])

  useEffect(() => {
    try {
      const globalKey = 'ollama:selectedSystemPromptId'
      localStorage.setItem(globalKey, systemPromptId)
      if (chatId) {
        localStorage.setItem(`ollama:chat:${chatId}:systemPromptId`, systemPromptId)
      }
    } catch {}
  }, [systemPromptId, chatId])

  const effectiveDefault = useMemo(() => defaultModel ?? models[0]?.name ?? '', [defaultModel, models])

  useEffect(() => {
    if (!model && effectiveDefault) setModel(effectiveDefault)
  }, [effectiveDefault, model])

  // apply prefill text when provided
  useEffect(() => {
    if (typeof prefillText === 'string') {
      setText(prefillText)
      isTextFromPrefill.current = true
    }
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
    const selectedPrompt = systemPromptId !== 'none' ? systemPrompts.find((p: any) => p.id === systemPromptId) : undefined
    onSubmit?.({ text, model, reasoningLevel: rl as any, systemPromptContent: selectedPrompt?.content, systemPromptId })
  }

  const handleStop = () => {
    onStop?.()
  }

  // Clear text only after successful submission (when status transitions from streaming to ready)
  const [shouldClearText, setShouldClearText] = useState(false)
  
  useEffect(() => {
    if (status === 'streaming') {
      setShouldClearText(true)
    } else if (status === 'ready' && shouldClearText && autoClear && !isInitialAutoSubmit.current) {
      setText('')
      setShouldClearText(false)
    }
  }, [status, shouldClearText, autoClear])

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
              onChange={(e) => {
                setText(e.target.value)
                // Call onTypingStart when user starts typing (from empty to non-empty)
                // But not if the text was set via prefill
                if (!text && e.target.value && onTypingStart && !hasCalledTypingStart.current && !isTextFromPrefill.current) {
                  hasCalledTypingStart.current = true
                  onTypingStart()
                }
                // Call onTypingStop when user deletes all text (from non-empty to empty)
                if (text && !e.target.value && onTypingStop && hasCalledTypingStart.current) {
                  hasCalledTypingStart.current = false
                  onTypingStop()
                }
                // Reset prefill flag when user starts modifying the text
                if (isTextFromPrefill.current && e.target.value !== prefillText) {
                  isTextFromPrefill.current = false
                }
              }}
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
                <PromptInputModelSelect onValueChange={(v) => setSystemPromptId(v)} value={systemPromptId}>
                  <PromptInputModelSelectTrigger className="h-8">
                    <PromptInputModelSelectValue />
                  </PromptInputModelSelectTrigger>
                  <PromptInputModelSelectContent>
                    <PromptInputModelSelectItem key={'none'} value={'none'}>
                      Default
                    </PromptInputModelSelectItem>
                    {systemPrompts.map((p: any) => (
                      <PromptInputModelSelectItem key={p.id} value={p.id}>
                        {p.title}
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
              <PromptInputSubmit 
                disabled={!text && status === 'ready'} 
                status={status}
                onClick={status === 'streaming' ? handleStop : undefined}
                type={status === 'streaming' ? 'button' : 'submit'}
              />
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>
    </div>
  )
}

export default ChatInput


