'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { api } from '~/trpc/react'
import ChatInput from '~/components/chat-input'
import { useOllamaChat } from '~/hooks/use-ollama-chat'
import { Conversation, ConversationContent } from '~/components/ai-elements/conversation'
import { Message, MessageContent } from '~/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '~/components/ai-elements/reasoning'
import { Response } from '~/components/ai-elements/response'
import { useChatStore } from '~/lib/chat-store'
import { toast } from 'sonner'
// call server route for chat name to avoid importing node-only SDK in client


type ModelInfo = { name: string }

export default function ChatByIdPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const search = useSearchParams()
  const { data, error } = api.models.list.useQuery()
  const models: ModelInfo[] = data?.models ?? []
  const [selectedModel, setSelectedModel] = useState('')
  const { renameChat, selectChat, setLastSetPrompt, selectedModel: storeModel, chats } = useChatStore()
  
  // Initialize model selection for the current chat
  useEffect(() => {
    if (!models.length) return
    const chatId = String(id)
    const chat = chats.find(c => c.id === chatId)
    const perChatModel = chat?.lastSetModel || undefined
    const newSelectedModel = perChatModel || storeModel || models[0]!.name
    
    // Only update if the model has actually changed to avoid unnecessary rerenders
    if (newSelectedModel !== selectedModel) {
      setSelectedModel(newSelectedModel)
    }
  }, [models, storeModel, chats, id, selectedModel])

  // Get the lastSetPrompt for this chat
  const chat = chats.find(c => c.id === String(id))
  const lastSetPrompt = chat?.lastSetPrompt || undefined

  const { messages, status, streamPhase, submit, editMessage, retryMessage, abort } = useOllamaChat(String(id))
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const utils = api.useUtils()
  const setModelMutation = api.chats.setModel.useMutation({
    onSuccess: () => {
      // Invalidate chats cache to ensure UI consistency
      utils.chats.list.invalidate()
    },
    onError: (error) => {
      console.warn('[chat] failed to set model:', error.message)
      // Don't show error toast as this is often due to race conditions and will retry
    }
  })

  const setPromptMutation = api.chats.setPrompt.useMutation({
    onSuccess: () => {
      // Invalidate chats cache to ensure UI consistency
      utils.chats.list.invalidate()
    },
    onError: (error) => {
      console.warn('[chat] failed to set prompt:', error.message)
      // Don't show error toast as this is often due to race conditions and will retry
    }
  })

  // auto-submit first message from landing page (guard against double-invoke)
  const didAutoSubmitRef = useRef(false)
  useEffect(() => {
    // support either URL params (legacy) or sessionStorage initial payload
    let first = search?.get('q')
    let model = search?.get('m')
    let sys: string | null | undefined = search?.get('s')
    let sysId: string | null | undefined = search?.get('sid')
    if (!first || !model) {
      try {
        const raw = sessionStorage.getItem(`chat:${String(id)}:initial`)
        if (raw) {
          const obj = JSON.parse(raw) as { q?: string; m?: string; s?: string | null; sid?: string | null }
          first = obj.q ?? first
          model = obj.m ?? model
          sys = obj.s ?? sys
          sysId = obj.sid ?? sysId
          sessionStorage.removeItem(`chat:${String(id)}:initial`)
        }
      } catch {}
    }
    if (!didAutoSubmitRef.current && first && model) {
      didAutoSubmitRef.current = true
      selectChat(String(id))
      // fire-and-forget name generation
      ;(async () => {
        try {
          const r = await fetch('/api/ollama/chat-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, firstMessage: first }),
          })
          const data = await r.json()
          if (!r.ok) {
            const detail = String(data?.error || '')
            toast.error('Failed to name chat', { description: detail || 'Server responded with an error.' })
          } else {
            const name = String(data?.title ?? '')
            if (name) renameChat(String(id), name)
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error'
          toast.error('Failed to name chat', { description: msg })
        }
      })()
      setSelectedModel(model)
      // persist per-chat lastSetModel with guard
      try {
        const chatIdStr = String(id)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatIdStr)
        if (isUuid && model) {
          setModelMutation.mutate({ id: chatIdStr, model })
        }
      } catch {}
      // Small delay to ensure component has mounted and UI is ready
      setTimeout(() => {
        submit({ text: first, model, systemPromptContent: sys ?? undefined })
      }, 100)
      // Update chat store with the selected system prompt
      if (sysId && sysId !== 'none') {
        setLastSetPrompt(String(id), sysId)
      }

      // Persist per-chat selected system prompt id to localStorage for selector default
      try {
        const val = sysId ?? (sys ? 'custom' : 'none')
        if (val && val !== 'custom') {
          localStorage.setItem(`ollama:chat:${String(id)}:systemPromptId`, val)
        } else if (!sysId && !sys) {
          localStorage.setItem(`ollama:chat:${String(id)}:systemPromptId`, 'none')
        }
      } catch {}
      // clear query params from history without reloading
      const url = new URL(window.location.href)
      url.search = ''
      window.history.replaceState(null, '', url.toString())
      // no URL mutation here; it's fine if params remain during initial render
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (error) {
      const msg = (error as any)?.message ?? 'Failed to load models'
      toast.error('Models unavailable', { description: String(msg) })
    }
  }, [error])

  const handleEdit = (messageId: string) => {
    setEditingMessageId(messageId)
  }

  const handleEditSave = async (messageId: string, newText: string) => {
    setEditingMessageId(null)
    // Persist current model selection before edit
    const chatIdStr = String(id)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatIdStr)
    if (isUuid && selectedModel) {
      setModelMutation.mutate({ id: chatIdStr, model: selectedModel })
    }
    // Use the current selected model for the edit
    await editMessage(messageId, newText, selectedModel)
  }

  const handleEditCancel = () => {
    setEditingMessageId(null)
  }

  const handleRetry = async (messageId: string, model?: string) => {
    // Use the provided model or current selected model
    const retryModel = model || selectedModel
    // Update selected model if a specific model was chosen for retry
    if (model && model !== selectedModel) {
      setSelectedModel(model)
      // Persist the new model selection
      const chatIdStr = String(id)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatIdStr)
      if (isUuid) {
        setModelMutation.mutate({ id: chatIdStr, model })
      }
    }
    await retryMessage(messageId, retryModel)
  }

  return (
    <div className="relative mx-auto h-dvh flex w-full max-w-4xl flex-1 flex-col gap-4 p-4 pb-0">
        {/* header strip now rendered in layout to avoid occlusion */}
        <Conversation>
          <ConversationContent className="pb-32">
            {messages.map((m) => (
              <Message 
                key={`${String(id)}-${m.id}`} 
                from={m.role}
                message={m}
                isEditing={editingMessageId === m.id}
                onEdit={handleEdit}
                onRetry={handleRetry}
                onEditSave={handleEditSave}
                onEditCancel={handleEditCancel}
              >
                <MessageContent
                  message={m}
                  isEditing={editingMessageId === m.id}
                  onEditSave={handleEditSave}
                  onEditCancel={handleEditCancel}
                >
                  {editingMessageId !== m.id && m.parts.map((p, idx) => {
                    if (p.type === 'reasoning') {
                      return (
                        <Reasoning key={`reasoning-${idx}`} isStreaming={streamPhase === 'reasoning'} defaultOpen={false}>
                          <ReasoningTrigger />
                          <ReasoningContent>{p.text}</ReasoningContent>
                        </Reasoning>
                      )
                    }
                    return <Response key={`response-${idx}`} isWaiting={status === 'submitted' && idx === 0 && m.role === 'assistant'}>{p.text}</Response>
                  })}
                </MessageContent>
              </Message>
            ))}
            {((status === 'submitted' || status === 'streaming') && !messages.some(m => m.role === 'assistant')) ? (
              <Message from={'assistant'}>
                <MessageContent>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-foreground/70 animate-bounce [animation-delay:-0.2s]" />
                    <span className="h-2 w-2 rounded-full bg-foreground/70 animate-bounce [animation-delay:-0.1s]" />
                    <span className="h-2 w-2 rounded-full bg-foreground/70 animate-bounce" />
                  </div>
                </MessageContent>
              </Message>
            ) : null}
          </ConversationContent>
        </Conversation>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4">
        <div className="pointer-events-auto mx-auto w-full max-w-4xl">
          <ChatInput
            models={models}
            defaultModel={selectedModel}
            chatId={String(id)}
            defaultSystemPromptId={lastSetPrompt}
            placement="container"
            maxWidthClass="max-w-4xl"
            status={status}
            autoClear={false}
            initialAutoSubmit={true}
            onStop={abort}
            onSubmit={({ text, model, reasoningLevel, systemPromptContent, systemPromptId }) => {
              // Update selected model locally
              setSelectedModel(model)
              // Persist model selection for this chat (with small delay to ensure chat exists)
              const chatIdStr = String(id)
              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatIdStr)
              if (isUuid && model) {
                // Small delay to avoid race condition with chat creation
                setTimeout(() => {
                  setModelMutation.mutate({ id: chatIdStr, model })
                }, 100)
              }
              // Persist system prompt selection for this chat
              if (isUuid && systemPromptId && systemPromptId !== 'none') {
                setTimeout(() => {
                  setPromptMutation.mutate({ id: chatIdStr, promptId: systemPromptId })
                }, 100)
              }
              // Submit the message
              submit({ text, model, reasoningLevel, systemPromptContent })
            }}
          />
        </div>
      </div>
    </div>
  )
}


