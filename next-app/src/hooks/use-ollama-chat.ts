'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatStore } from '~/lib/chat-store'
import type { UIMessage } from '~/lib/chat-types'

// moved to lib/chat-types

type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

export function useOllamaChat(chatId: string) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [streamPhase, setStreamPhase] = useState<'idle' | 'reasoning' | 'answer'>('idle')
  const abortRef = useRef<AbortController | null>(null)
  const { selectChat } = useChatStore()
  const [reasoningDurations, setReasoningDurations] = useState<Record<string, number>>({})
  const currentAssistantIdRef = useRef<string | null>(null)
  const reasoningStartRef = useRef<number | null>(null)

  // rehydrate chat state from sessionStorage per chat id
  useEffect(() => {
    selectChat(chatId)
    try {
      const raw = sessionStorage.getItem(`chat:${chatId}:messages`)
      if (raw) {
        const parsed = JSON.parse(raw) as UIMessage[]
        setMessages(parsed)
      }
      const rd = sessionStorage.getItem(`chat:${chatId}:rd`)
      if (rd) setReasoningDurations(JSON.parse(rd) as Record<string, number>)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  

  const appendUser = useCallback((text: string) => {
    const msg: UIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text }],
    }
    setMessages((prev) => [...prev, msg])
  }, [])

  const submit = useCallback(
    async ({ text, model, reasoningLevel = 'high' }: { text: string; model: string; reasoningLevel?: 'low' | 'medium' | 'high' }) => {
      if (!text.trim()) return
      appendUser(text)
      setStatus('submitted')
      setStreamPhase('reasoning')
      // create an assistant message id upfront
      currentAssistantIdRef.current = crypto.randomUUID()
      reasoningStartRef.current = null

      const controller = new AbortController()
      abortRef.current = controller
      try {
        const payload = {
          model,
          messages: messages
            .map((m) => ({ role: m.role, content: m.parts.map((p) => p.text).join(' ') }))
            .concat([{ role: 'user' as const, content: text }]),
          think: true,
          reasoningLevel,
        }

        const res = await fetch('/api/ollama/chat', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          setStatus('error')
          setStreamPhase('idle')
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        setStatus('streaming')

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let index
          while ((index = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, index).trim()
            buffer = buffer.slice(index + 1)
            if (!line) continue
            let obj: any
            try {
              obj = JSON.parse(line)
            } catch {
              continue
            }
            if (obj.kind === 'done') {
              setStatus('ready')
              setStreamPhase('idle')
              // finalize duration if we recorded a start
              if (currentAssistantIdRef.current && reasoningStartRef.current !== null) {
                const seconds = Math.max(0, Math.round((Date.now() - reasoningStartRef.current) / 1000))
                setReasoningDurations(prev => {
                  const next = { ...prev, [currentAssistantIdRef.current as string]: seconds }
                  try { sessionStorage.setItem(`chat:${chatId}:rd`, JSON.stringify(next)) } catch {}
                  return next
                })
              }
              currentAssistantIdRef.current = null
              reasoningStartRef.current = null
              continue
            }
            const kind = obj.kind as 'reasoning' | 'text'
            const textDelta = String(obj.text ?? '')
            if (kind === 'text' && streamPhase !== 'answer') setStreamPhase('answer')

            setMessages((prev) => {
              const next = [...prev]
              if (next.length === 0 || next[next.length - 1]!.role !== 'assistant') {
                const aid = currentAssistantIdRef.current ?? crypto.randomUUID()
                currentAssistantIdRef.current = aid
                next.push({ id: aid, role: 'assistant', parts: [] })
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
              try {
                sessionStorage.setItem(`chat:${chatId}:messages`, JSON.stringify(next))
              } catch {}
              return next
            })
            // start reasoning timer when the first reasoning chunk arrives
            if (kind === 'reasoning' && reasoningStartRef.current === null) {
              reasoningStartRef.current = Date.now()
            }
          }
        }
        setStatus('ready')
        setStreamPhase('idle')
      } catch (e) {
        setStatus('error')
        setStreamPhase('idle')
      } finally {
        abortRef.current = null
      }
    },
    [appendUser, messages, streamPhase]
  )

  return {
    messages,
    status,
    streamPhase,
    submit,
  }
}


