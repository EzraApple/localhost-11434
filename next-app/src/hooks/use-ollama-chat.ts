'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatStore } from '~/lib/chat-store'
import type { UIMessage } from '~/lib/chat-types'
import { toast } from 'sonner'
import { api } from '~/trpc/react'

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
  const createMessageMutation = api.messages.create.useMutation()
  const currentChatIdRef = useRef<string>(chatId)

  // rehydrate chat state from DB per chat id
  const { data: initialData } = api.messages.list.useQuery(
    { chatId },
    { enabled: !!chatId, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 5_000 }
  )
  const utils = api.useUtils()

  // Reset state when chat ID changes
  useEffect(() => {
    if (currentChatIdRef.current !== chatId) {
      // Abort any ongoing streaming
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      
      // Reset all state for the new chat
      setMessages([])
      setStatus('ready')
      setStreamPhase('idle')
      setReasoningDurations({})
      currentAssistantIdRef.current = null
      reasoningStartRef.current = null
      currentChatIdRef.current = chatId
    }
    
    selectChat(chatId)
  }, [chatId, selectChat])

  // Hydrate messages from DB when data is available
  useEffect(() => {
    if (initialData?.messages && currentChatIdRef.current === chatId) {
      const fromDb: UIMessage[] = initialData.messages.map(m => ({
        id: m.id,
        role: String(m.role).toLowerCase() as UIMessage['role'],
        parts: (m.parts as any[]) as UIMessage['parts'],
      }))
      setMessages(fromDb)
    }
  }, [initialData?.messages, chatId])

  // Force refetch when returning to this chat to ensure fresh data
  useEffect(() => {
    const refetchData = async () => {
      if (chatId && currentChatIdRef.current === chatId) {
        await utils.messages.list.refetch({ chatId })
      }
    }
    refetchData()
  }, [chatId, utils])

  

  const appendUser = useCallback((text: string) => {
    const msg: UIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text }],
    }
    setMessages((prev) => [...prev, msg])
  }, [])

  const submit = useCallback(
    async ({ text, model, reasoningLevel, systemPromptContent }: { text: string; model: string; reasoningLevel?: 'low' | 'medium' | 'high'; systemPromptContent?: string }) => {
      if (!text.trim()) return
      appendUser(text)
      // persist user message to DB (fire-and-forget to avoid UI lag)
      createMessageMutation.mutate(
        { chatId, role: 'USER', parts: [{ type: 'text', text }] } as any,
        {
          onError: (e) => {
            // eslint-disable-next-line no-console
            console.warn('[chat] failed to persist user message:', (e as Error).message)
          },
        }
      )
      setStatus('submitted')
      setStreamPhase('reasoning')
      // create an assistant message id upfront
      currentAssistantIdRef.current = crypto.randomUUID()
      reasoningStartRef.current = null

      const controller = new AbortController()
      abortRef.current = controller
      try {
        // Get current messages state to avoid stale closure
        const currentMessages = await new Promise<UIMessage[]>((resolve) => {
          setMessages((prev) => {
            resolve(prev)
            return prev
          })
        })
        
        const baseHistory = currentMessages.map((m) => ({ role: m.role, content: m.parts.map((p) => p.text).join(' ') }))
        const combinedMessages = [
          ...(systemPromptContent ? [{ role: 'system' as const, content: systemPromptContent }] : []),
          ...baseHistory,
          // Don't add the user message again - it's already in baseHistory after appendUser()
        ]
        const payload = {
          model,
          messages: combinedMessages,
          // Only enable think when we have an explicit supported reasoning level
          think: reasoningLevel ? reasoningLevel : false,
          reasoningLevel,
          chatId,
          assistantMessageId: currentAssistantIdRef.current,
        }

        const res = await fetch('/api/ollama/chat', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          let detail = ''
          try {
            const data = await res.json()
            detail = String(data?.error || '')
          } catch {}
          toast.error('Chat failed', {
            description: detail || 'The server returned an error while starting the chat.',
          })
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
            if (obj.kind === 'error') {
              toast.error('Streaming error', { description: String(obj.error || 'An unknown streaming error occurred') })
              setStatus('error')
              setStreamPhase('idle')
              continue
            }
            if (obj.kind === 'done') {
              setStatus('ready')
              setStreamPhase('idle')
              // finalize duration if we recorded a start
              if (currentAssistantIdRef.current && reasoningStartRef.current !== null) {
                const seconds = Math.max(0, Math.round((Date.now() - reasoningStartRef.current) / 1000))
                setReasoningDurations(prev => ({ ...prev, [currentAssistantIdRef.current as string]: seconds }))
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
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error('Chat error', { description: msg })
        setStatus('error')
        setStreamPhase('idle')
      } finally {
        abortRef.current = null
      }
    },
    [appendUser, chatId, streamPhase, createMessageMutation]
  )

  const deleteAfterMessageMutation = api.messages.deleteAfterMessage.useMutation()
  const deleteMessageMutation = api.messages.deleteMessage.useMutation()

  const editMessage = useCallback(async (messageId: string, newText: string, model: string, systemPromptContent?: string) => {
    // Find the message index
    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) return

    // Remove all messages after the edited message (including the edited one)
    const newMessages = messages.slice(0, messageIndex)
    
    // Add the edited user message
    const editedMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: newText }],
    }
    
    setMessages([...newMessages, editedMessage])
    
    // Delete the original message and all messages after it from DB
    try {
      await new Promise<void>((resolve, reject) => {
        deleteAfterMessageMutation.mutate(
          { chatId, messageId: messages[messageIndex]!.id },
          {
            onSuccess: () => {
              // Invalidate messages cache after successful deletion
              utils.messages.list.invalidate({ chatId })
              resolve()
            },
            onError: (e) => {
              console.warn('[chat] failed to delete messages after edit:', (e as Error).message)
              reject(e)
            },
          }
        )
      })
    } catch (error) {
      // Continue even if deletion fails to avoid blocking the edit
    }
    
    // Persist the edited message to DB
    try {
      await new Promise<void>((resolve, reject) => {
        createMessageMutation.mutate(
          { chatId, role: 'USER', parts: [{ type: 'text', text: newText }], id: editedMessage.id } as any,
          {
            onSuccess: () => {
              // Invalidate messages cache after successful creation
              utils.messages.list.invalidate({ chatId })
              resolve()
            },
            onError: (e) => {
              console.warn('[chat] failed to persist edited message:', (e as Error).message)
              reject(e)
            },
          }
        )
      })
    } catch (error) {
      // Continue even if persistence fails
    }

    // Submit the new conversation (don't pass the text again since it's already in history)
    await submitWithHistory('', model, [...newMessages, editedMessage], systemPromptContent, editedMessage.id)
  }, [messages, chatId, createMessageMutation, deleteAfterMessageMutation, utils])

  const retryMessage = useCallback(async (messageId: string, model?: string, systemPromptContent?: string) => {
    // Find the assistant message and the user message before it
    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) return

    // Find the previous user message
    let userMessageIndex = -1
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user') {
        userMessageIndex = i
        break
      }
    }
    
    if (userMessageIndex === -1) return

    const userMessage = messages[userMessageIndex]!
    const userText = userMessage.parts.find(p => p.type === 'text')?.text
    if (!userText) return

    // Remove all messages after the user message
    const newMessages = messages.slice(0, userMessageIndex + 1)
    setMessages(newMessages)

    // Delete the assistant message and any subsequent messages from DB
    try {
      await new Promise<void>((resolve, reject) => {
        deleteAfterMessageMutation.mutate(
          { chatId, messageId: messages[messageIndex]!.id }, // Delete the assistant message, not the user message
          {
            onSuccess: () => {
              // Invalidate messages cache after successful deletion
              utils.messages.list.invalidate({ chatId })
              resolve()
            },
            onError: (e) => {
              console.warn('[chat] failed to delete messages after retry:', (e as Error).message)
              reject(e)
            },
          }
        )
      })
    } catch (error) {
      // Continue even if deletion fails
    }

    // Use the provided model or get the current model from context
    const retryModel = model || 'llama3.2:latest' // fallback model
    
    // Resubmit with the same user message (don't pass text since it's already in newMessages)
    await submitWithHistory('', retryModel, newMessages, systemPromptContent, userMessage.id)
  }, [messages, chatId, deleteAfterMessageMutation, utils])

  const submitWithHistory = useCallback(async (
    text: string, 
    model: string, 
    history: UIMessage[], 
    systemPromptContent?: string,
    userMessageId?: string
  ) => {
    setStatus('submitted')
    setStreamPhase('reasoning')
    currentAssistantIdRef.current = crypto.randomUUID()
    reasoningStartRef.current = null

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const baseHistory = history.map((m) => ({ 
        role: m.role, 
        content: m.parts.map((p) => p.text).join(' ') 
      }))
      
      const combinedMessages = [
        ...(systemPromptContent ? [{ role: 'system' as const, content: systemPromptContent }] : []),
        ...baseHistory,
        // Only add user message if it's not already in the history (for new messages, not edits)
        ...(text && !baseHistory.some(m => m.role === 'user' && m.content === text) 
          ? [{ role: 'user' as const, content: text }] 
          : []),
      ]

              const payload = {
          model,
          messages: combinedMessages,
          think: false, // Can be enhanced later
          chatId,
          assistantMessageId: currentAssistantIdRef.current,
          userMessageId,
        }

      const res = await fetch('/api/ollama/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        let detail = ''
        try {
          const data = await res.json()
          detail = String(data?.error || '')
        } catch {}
        toast.error('Chat failed', {
          description: detail || 'The server returned an error while starting the chat.',
        })
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
          if (obj.kind === 'error') {
            toast.error('Streaming error', { description: String(obj.error || 'An unknown streaming error occurred') })
            setStatus('error')
            setStreamPhase('idle')
            continue
          }
          if (obj.kind === 'done') {
            setStatus('ready')
            setStreamPhase('idle')
            if (currentAssistantIdRef.current && reasoningStartRef.current !== null) {
              const seconds = Math.max(0, Math.round((Date.now() - reasoningStartRef.current) / 1000))
              setReasoningDurations(prev => ({ ...prev, [currentAssistantIdRef.current as string]: seconds }))
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
            return next
          })
          if (kind === 'reasoning' && reasoningStartRef.current === null) {
            reasoningStartRef.current = Date.now()
          }
        }
      }
      setStatus('ready')
      setStreamPhase('idle')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      toast.error('Chat error', { description: msg })
      setStatus('error')
      setStreamPhase('idle')
    } finally {
      abortRef.current = null
    }
  }, [chatId, streamPhase])

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
      setStatus('ready')
      setStreamPhase('idle')
    }
  }, [])

  return {
    messages,
    status,
    streamPhase,
    submit,
    editMessage,
    retryMessage,
    abort,
  }
}


