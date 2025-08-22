'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '~/trpc/react'
import ChatInput from '~/components/chat-input'
import { useOllamaChat } from '~/hooks/use-ollama-chat'
import { Conversation, ConversationContent } from '~/components/ai-elements/conversation'
import { Message, MessageContent, MessageImage } from '~/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '~/components/ai-elements/reasoning'
import { Response } from '~/components/ai-elements/response'
import { useChatStore } from '~/lib/chat-store'
import { toast } from 'sonner'
import { Paperclip } from 'lucide-react'
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
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<Array<{ data: string; mimeType: string; fileName: string }>>([])
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
    let initialImages: Array<{ data: string; mimeType: string; fileName: string }> | null = null
    if (!first || !model) {
      try {
        const raw = sessionStorage.getItem(`chat:${String(id)}:initial`)
        if (raw) {
          const obj = JSON.parse(raw) as { q?: string; m?: string; s?: string | null; sid?: string | null; images?: Array<{ data: string; mimeType: string; fileName: string }> | null }
          first = obj.q ?? first
          model = obj.m ?? model
          sys = obj.s ?? sys
          sysId = obj.sid ?? sysId
          initialImages = obj.images ?? null
          sessionStorage.removeItem(`chat:${String(id)}:initial`)
        }
      } catch {}
    }
    if (!didAutoSubmitRef.current && first && model) {
      didAutoSubmitRef.current = true
      selectChat(String(id))
      
      // Set initial images if they exist (will be cleared after submit)
      if (initialImages && initialImages.length > 0) {
        setUploadedImages(initialImages)
      }
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
            if (name) {
              renameChat(String(id), name)
              // Invalidate chats cache to update sidebar immediately
              utils.chats.list.invalidate()
            }
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
        submit({ text: first, model, systemPromptContent: sys ?? undefined, images: initialImages ?? undefined })
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
    await editMessage(messageId, newText, selectedModel, undefined, undefined)
  }

  const handleEditCancel = () => {
    setEditingMessageId(null)
  }

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isDragOver) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    // Only set to false if we're leaving the component entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter(file =>
      file.type.startsWith('image/') &&
      file.size <= 10 * 1024 * 1024 // 10MB limit
    )

    if (imageFiles.length === 0) {
      toast.error('Unsupported file type', {
        description: 'Please upload image files only (PNG, JPG, JPEG, GIF, WebP)'
      })
      return
    }

    const promises = imageFiles.map(file => {
      return new Promise<{ data: string; mimeType: string; fileName: string }>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result
          if (!result) {
            reject(new Error('Failed to read file'))
            return
          }
          const resultStr = result as string
          const base64Data = resultStr.split(',')[1]
          if (!base64Data) {
            reject(new Error('Invalid file format'))
            return
          }
          resolve({
            data: base64Data,
            mimeType: file.type,
            fileName: file.name
          })
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    })

    Promise.all(promises).then(images => {
      setUploadedImages(prev => [...prev, ...images])
    })
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
    <div
      className="relative mx-auto h-dvh flex min-w-full flex-1 flex-col gap-4 p-4 pb-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
        {/* Full window drag overlay */}
        {isDragOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1515]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border border-[#2b3f3e]/30 bg-[#132827]/90 shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-[#22c55e]/10 flex items-center justify-center">
                <Paperclip className="w-8 h-8 text-[#22c55e]" />
              </div>
              <div className="text-center">
                <div className="text-[#e5e9e8] font-medium text-lg mb-2">Drop images here</div>
                <div className="text-[#8b9491] text-sm">Supports: PNG, JPG, JPEG, GIF, WebP (max 10MB)</div>
              </div>
            </div>
          </div>
        )}

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
                    if (p.type === 'image') {
                      return (
                        <MessageImage
                          key={`image-${idx}`}
                          data={p.data}
                          mimeType={p.mimeType}
                          fileName={p.fileName}
                        />
                      )
                    }
                    return <Response key={`response-${idx}`} isWaiting={status === 'submitted' && idx === 0 && m.role === 'assistant'}>{p.text}</Response>
                  })}
                </MessageContent>
              </Message>
            ))}
            {((status === 'submitted' || status === 'streaming') && 
              (messages.length === 0 || messages[messages.length - 1]?.role === 'user')) ? (
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
            autoClear={true}
            initialAutoSubmit={true}
            onStop={abort}
            uploadedImages={uploadedImages}
            onImagesChange={useCallback((images: Array<{ data: string; mimeType: string; fileName: string }>) => setUploadedImages(images), [])}
            onSubmit={({ text, model, reasoningLevel, systemPromptContent, systemPromptId, images }) => {
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
              submit({ text, model, reasoningLevel, systemPromptContent, images })
            }}
          />
        </div>
      </div>
    </div>
  )
}


