'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatStore } from '~/lib/chat-store'
import type { UIMessage } from '~/lib/chat-types'
import { api } from '~/trpc/react'
import { useCachedChatData } from '~/hooks/use-cached-chats'
import {
  type ChatStatus,
  type StreamPhase,
  type ChatSubmitParams,
  convertDbToUiMessages,
  createUserMessage,
  createDbMessageParts,
  extractImagesFromMessage,
  findUserTextFromMessage,
  validateSubmitParams,
  messageAlreadyExists,
  logPayload,
  prepareApiPayload,
  prepareSubmitHistoryPayload,
  fetchChatStream,
  processStreamReader,
} from './utils'
import { DisplayStateManager } from './display-state-manager'
import {
  handleFetchError,
  handleStreamingError,
  handleStreamChunkError,
  parseApiErrorResponse,
  formatErrorMessageForDisplay,
} from './error-handlers'

export function useOllamaChat(chatId: string) {
  // Display state manager for immediate UI updates
  const displayManagerRef = useRef<DisplayStateManager | null>(null)
  if (!displayManagerRef.current || displayManagerRef.current.getDebugInfo().chatId !== chatId) {
    displayManagerRef.current = new DisplayStateManager(chatId)
  }
  const displayManager = displayManagerRef.current

  // Force re-render when display state changes
  const [, forceRender] = useState({})
  const forceUpdate = useCallback(() => forceRender({}), [])

  // Setup display state change listener
  useEffect(() => {
    const unsubscribe = displayManager.onStateChange(forceUpdate)
    return unsubscribe
  }, [displayManager, forceUpdate])

  const abortRef = useRef<AbortController | null>(null)
  const { selectChat } = useChatStore()
  const createMessageMutation = api.messages.create.useMutation()
  const currentChatIdRef = useRef<string>(chatId)

  // Use cache-first data loading (replaces usePreloadedChatData)
  const { data: cachedChatData, source: cacheSource, isLoading: isCacheLoading, fromCache } = useCachedChatData(chatId)

  // Fallback to TRPC only if cache miss or specific scenarios
  const { data: initialData } = api.messages.list.useQuery(
    { chatId },
    { 
      enabled: !!chatId && !fromCache && cacheSource === 'not_found', 
      refetchOnWindowFocus: false, 
      refetchOnReconnect: false, 
      staleTime: 5_000 
    }
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
      
      // Reset display state for the new chat
      displayManager.reset()
      currentChatIdRef.current = chatId
    }
    
    selectChat(chatId)
  }, [chatId, selectChat, displayManager])

  // Hydrate messages from cache-first system
  useEffect(() => {
    let messages = null
    
    console.log(`[useOllamaChat] Hydrating messages for ${chatId}`, { 
      cacheSource, 
      fromCache, 
      hasCachedData: !!cachedChatData, 
      messageCount: cachedChatData?.messages?.length || 0,
      hasTrpcData: !!initialData?.messages
    })
    
    if (cachedChatData?.messages && currentChatIdRef.current === chatId) {
      // Use cached data (fastest path - Memory/IndexedDB)
      messages = cachedChatData.messages
      console.log(`[useOllamaChat] ✓ Using cached messages from ${cacheSource}: ${messages.length} messages`)
    } else if (initialData?.messages && currentChatIdRef.current === chatId) {
      // Fallback to TRPC data (SQLite)
      messages = initialData.messages
      console.log(`[useOllamaChat] ⚠️ Fallback to TRPC messages: ${messages.length} messages`)
    }
    
    if (messages) {
      const fromDb = convertDbToUiMessages(messages)
      displayManager.hydrate(fromDb)
      console.log(`[useOllamaChat] Hydrated ${fromDb.length} UI messages for ${chatId}`)
    }
  }, [cachedChatData?.messages, initialData?.messages, chatId, displayManager, cacheSource, fromCache])

  // Force refetch when returning to this chat to ensure fresh data
  // Only refetch if we had to fall back to TRPC (cache miss)
  useEffect(() => {
    const refetchData = async () => {
      if (chatId && currentChatIdRef.current === chatId && cacheSource === 'not_found') {
        console.log(`[useOllamaChat] Refetching messages for ${chatId} due to cache miss`)
        await utils.messages.list.refetch({ chatId })
      }
    }
    refetchData()
  }, [chatId, utils, cacheSource])

  const appendUser = useCallback((text: string, images?: Array<{ data: string; mimeType: string; fileName: string }>) => {
    const msg = createUserMessage(text, images)
    displayManager.addUserMessage(msg)
    return msg
  }, [displayManager])

  const submit = useCallback(
    async (params: ChatSubmitParams) => {
      if (!validateSubmitParams(params)) return

      // Remove any existing error messages
      displayManager.removeErrorMessages()

      // Check if this exact message already exists
      const currentMessages = displayManager.getMessages()
      if (!messageAlreadyExists(currentMessages, params.text)) {
        // Use structured user message if provided, otherwise create legacy format
        const userMessage = params.userMessage || appendUser(params.text, params.images)
        
        // Add to display manager if it's a new structured message
        if (params.userMessage) {
          displayManager.addUserMessage(userMessage)
        }
        
        // Persist user message to DB (fire-and-forget to avoid UI lag)
        const dbParts = createDbMessageParts(params.text, params.images, params.userMessage)
        createMessageMutation.mutate(
          { chatId, role: 'USER', parts: dbParts, id: userMessage.id } as any,
          {
            onSuccess: () => {
              displayManager.markAsPersisted(userMessage.id)
              console.log(`[useOllamaChat] ✓ Persisted user message ${userMessage.id}`)
              // Note: Cache is already updated optimistically via displayManager
            },
            onError: (e) => {
              console.warn('[chat] failed to persist user message:', e?.message || 'Unknown error')
            },
          }
        )
      }

      displayManager.setStatus('submitted')
      displayManager.setStreamPhase('reasoning')
      
      // Create assistant message ID upfront
      const assistantId = crypto.randomUUID()
      displayManager.setCurrentAssistantId(assistantId)
      displayManager.setReasoningStart(null)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const currentMessages = displayManager.getMessages()
        const baseHistory = currentMessages.map((m) => {
          const textParts = m.parts.filter(p => p.type === 'text')
          const imageParts = m.parts.filter(p => p.type === 'image')
          const fileParts = m.parts.filter(p => p.type === 'file')
          
          // Combine text content with file content for text/code files
          let content = textParts.map((p) => p.text).join(' ')
          
          // Add file content for user messages (incorporate into text for the model)
          if (m.role === 'user' && fileParts.length > 0) {
            const fileContents = fileParts.map(file => 
              `### ${file.fileName}\n\n${file.content || file.data}\n`
            ).join('\n')
            
            if (fileContents) {
              content += `\n\n## Attached Files\n\n${fileContents}`
            }
          }
          
          const message: any = { role: m.role, content }

          // Add images for this message if it has any
          if (m.role === 'user' && imageParts.length > 0) {
            message.images = imageParts.map(img => img.data)
          }

          return message
        })
        
        const payload = prepareApiPayload({
          model: params.model,
          messages: baseHistory,
          systemPromptContent: params.systemPromptContent,
          reasoningLevel: params.reasoningLevel,
          chatId,
          assistantMessageId: assistantId,
        })

        logPayload(payload, 'sending')

        const res = await fetchChatStream(payload, controller.signal)
        const reader = res.body!.getReader()
        displayManager.setStatus('streaming')

        for await (const chunk of processStreamReader(reader)) {
          if (chunk.kind === 'error') {
            const ollamaError = handleStreamChunkError(chunk)
            const errorMessage = formatErrorMessageForDisplay(ollamaError)
            displayManager.addErrorMessage(errorMessage, ollamaError.isRetryable)
            continue
          }
          
          if (chunk.kind === 'done') {
            displayManager.setStatus('ready')
            displayManager.setStreamPhase('idle')
            displayManager.finalizeReasoning()
            continue
          }

          // Handle all chunk types (reasoning, text, tool_call, tool_result, stream_continue)
          console.log('[useOllamaChat] Processing chunk:', chunk);
          displayManager.updateStreamingMessage(chunk, assistantId)
        }

        displayManager.setStatus('ready')
        displayManager.setStreamPhase('idle')

      } catch (e) {
        const ollamaError = handleFetchError(e, 'submit')
        const errorMessage = formatErrorMessageForDisplay(ollamaError)
        displayManager.addErrorMessage(errorMessage, ollamaError.isRetryable)
      } finally {
        abortRef.current = null
      }
    },
    [appendUser, chatId, createMessageMutation, displayManager]
  )

  const deleteAfterMessageMutation = api.messages.deleteAfterMessage.useMutation()

  const editMessage = useCallback(async (messageId: string, newText: string, model: string, systemPromptContent?: string, images?: Array<{ data: string; mimeType: string; fileName: string }>) => {
    // Remove any existing error messages
    displayManager.removeErrorMessages()
    
    // Find the message index
    const messageIndex = displayManager.findMessageIndex(messageId)
    if (messageIndex === -1) return

    // Remove all messages after the edited message (including the edited one)
    const removedMessages = displayManager.removeMessagesAfter(messageId)
    
    // Add the edited user message
    const editedMessage = createUserMessage(newText, images)
    displayManager.addUserMessage(editedMessage)
    
    // Delete the original message and all messages after it from DB
    const originalMessage = removedMessages[0]
    if (originalMessage) {
      try {
        await new Promise<void>((resolve, reject) => {
          deleteAfterMessageMutation.mutate(
            { chatId, messageId: originalMessage.id },
            {
              onSuccess: () => {
                utils.messages.list.invalidate({ chatId })

                // Cache updates handled optimistically by displayManager
                resolve()
              },
              onError: (e) => {
                console.warn('[chat] failed to delete messages after edit:', e?.message || 'Unknown error')
                reject(e)
              },
            }
          )
        })
      } catch (error) {
        // Continue even if deletion fails to avoid blocking the edit
      }
    }
    
    // Persist the edited message to DB
    try {
      await new Promise<void>((resolve, reject) => {
        const dbParts = createDbMessageParts(newText, images)
        createMessageMutation.mutate(
          { chatId, role: 'USER', parts: dbParts, id: editedMessage.id } as any,
          {
            onSuccess: () => {
              displayManager.markAsPersisted(editedMessage.id)
              utils.messages.list.invalidate({ chatId })
              console.log(`[useOllamaChat] ✓ Persisted edited message ${editedMessage.id}`)
              resolve()
            },
            onError: (e) => {
              console.warn('[chat] failed to persist edited message:', e?.message || 'Unknown error')
              reject(e)
            },
          }
        )
      })
    } catch (error) {
      // Continue even if persistence fails
    }

    // Submit the new conversation (don't pass the text again since it's already in history)
    const currentMessages = displayManager.getMessages()
    await submitWithHistory('', model, currentMessages, systemPromptContent, editedMessage.id, images)
  }, [chatId, createMessageMutation, deleteAfterMessageMutation, utils, displayManager])

  const retryMessage = useCallback(async (messageId: string, model?: string, systemPromptContent?: string) => {
    // Remove any existing error messages
    displayManager.removeErrorMessages()
    
    // Find the assistant message and the user message before it
    const messageIndex = displayManager.findMessageIndex(messageId)
    if (messageIndex === -1) return

    const currentMessages = displayManager.getMessages()
    
    // Find the previous user message
    let userMessageIndex = -1
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (currentMessages[i]!.role === 'user') {
        userMessageIndex = i
        break
      }
    }
    
    if (userMessageIndex === -1) return

    const userMessage = currentMessages[userMessageIndex]!
    const userText = findUserTextFromMessage(userMessage)
    if (!userText) return

    // Remove all messages after the user message
    displayManager.replaceMessagesFromIndex(userMessageIndex + 1, [])

    // Delete the assistant message and any subsequent messages from DB
    const assistantMessage = currentMessages[messageIndex]
    if (assistantMessage) {
      try {
        await new Promise<void>((resolve, reject) => {
          deleteAfterMessageMutation.mutate(
            { chatId, messageId: assistantMessage.id },
            {
              onSuccess: () => {
                utils.messages.list.invalidate({ chatId })

                // Cache updates handled optimistically by displayManager
                resolve()
              },
              onError: (e) => {
                console.warn('[chat] failed to delete messages after retry:', e?.message || 'Unknown error')
                reject(e)
              },
            }
          )
        })
      } catch (error) {
        // Continue even if deletion fails
      }
    }

    // Use the provided model or get the current model from context
    const retryModel = model || 'llama3.2:latest' // fallback model
    
    // Extract images from the user message
    const images = extractImagesFromMessage(userMessage)

    // Resubmit with the same user message (don't pass text since it's already in newMessages)
    const updatedMessages = displayManager.getMessages()
    await submitWithHistory('', retryModel, updatedMessages, systemPromptContent, userMessage.id, images)
  }, [chatId, deleteAfterMessageMutation, utils, displayManager])

  const submitWithHistory = useCallback(async (
    text: string,
    model: string,
    history: UIMessage[],
    systemPromptContent?: string,
    userMessageId?: string,
    images?: Array<{ data: string; mimeType: string; fileName: string }>
  ) => {
    displayManager.setStatus('submitted')
    displayManager.setStreamPhase('reasoning')
    
    const assistantId = crypto.randomUUID()
    displayManager.setCurrentAssistantId(assistantId)
    displayManager.setReasoningStart(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const payload = prepareSubmitHistoryPayload({
        model,
        history,
        text,
        systemPromptContent,
        images,
        chatId,
        assistantMessageId: assistantId,
        userMessageId,
      })

      logPayload(payload, 'submitWithHistory')

      const res = await fetchChatStream(payload, controller.signal)
      const reader = res.body!.getReader()
      displayManager.setStatus('streaming')

      for await (const chunk of processStreamReader(reader)) {
        if (chunk.kind === 'error') {
          const ollamaError = handleStreamChunkError(chunk)
          const errorMessage = formatErrorMessageForDisplay(ollamaError)
          displayManager.addErrorMessage(errorMessage, ollamaError.isRetryable)
          continue
        }
        
        if (chunk.kind === 'done') {
          displayManager.setStatus('ready')
          displayManager.setStreamPhase('idle')
          displayManager.finalizeReasoning()
          continue
        }

        // Handle all chunk types (reasoning, text, tool_call, tool_result, stream_continue)
        console.log('[useOllamaChat] Processing chunk:', chunk);
        displayManager.updateStreamingMessage(chunk, assistantId)
      }
      
      displayManager.setStatus('ready')
      displayManager.setStreamPhase('idle')
    } catch (e) {
      const ollamaError = handleStreamingError(e, 'submitWithHistory')
      const errorMessage = formatErrorMessageForDisplay(ollamaError)
      displayManager.addErrorMessage(errorMessage, ollamaError.isRetryable)
    } finally {
      abortRef.current = null
    }
  }, [chatId, displayManager])

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
      displayManager.setStatus('ready')
      displayManager.setStreamPhase('idle')
    }
  }, [displayManager])

  return {
    messages: displayManager.getMessages(),
    status: displayManager.getStatus(),
    streamPhase: displayManager.getStreamPhase(),
    submit,
    editMessage,
    retryMessage,
    abort,
    // Expose tool calls and display manager for UI components
    displayManager,
    reasoningToolCalls: displayManager.getReasoningToolCalls(),
    responseToolCalls: displayManager.getResponseToolCalls(),
    reasoningTimeline: displayManager.getReasoningTimeline(),
    responseTimeline: displayManager.getResponseTimeline(),
  }
}


