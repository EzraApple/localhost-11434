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
// call server route for chat name to avoid importing node-only SDK in client

type ModelInfo = { name: string }

export default function ChatByIdPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const search = useSearchParams()
  const { data } = api.ollama.listModels.useQuery()
  const models: ModelInfo[] = data?.models ?? []
  const [selectedModel, setSelectedModel] = useState('')
  const { renameChat, selectChat } = useChatStore()
  useEffect(() => {
    if (models.length && !selectedModel) setSelectedModel(models[0]!.name)
  }, [models, selectedModel])

  const { messages, status, streamPhase, submit } = useOllamaChat(String(id))

  // auto-submit first message from landing page (guard against double-invoke)
  const didAutoSubmitRef = useRef(false)
  useEffect(() => {
    // support either URL params (legacy) or sessionStorage initial payload
    let first = search?.get('q')
    let model = search?.get('m')
    if (!first || !model) {
      try {
        const raw = sessionStorage.getItem(`chat:${String(id)}:initial`)
        if (raw) {
          const obj = JSON.parse(raw) as { q?: string; m?: string }
          first = obj.q ?? first
          model = obj.m ?? model
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
          const { title } = await r.json()
          const name = title as string
          renameChat(String(id), name)
        } catch {}
      })()
      submit({ text: first, model })
      // clear query params from history without reloading
      const url = new URL(window.location.href)
      url.search = ''
      window.history.replaceState(null, '', url.toString())
      // no URL mutation here; it's fine if params remain during initial render
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative mx-auto min-h-dvh flex w-full max-w-4xl flex-1 flex-col gap-4 p-4 pb-40">
        {/* header strip now rendered in layout to avoid occlusion */}
        <Conversation>
          <ConversationContent>
            {messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent>
                  {m.parts.map((p, idx) => {
                    if (p.type === 'reasoning') {
                      return (
                        <Reasoning key={idx} isStreaming={streamPhase === 'reasoning'} defaultOpen={false}>
                          <ReasoningTrigger />
                          <ReasoningContent>{p.text}</ReasoningContent>
                        </Reasoning>
                      )
                    }
                    return <Response key={idx} isWaiting={status === 'submitted' && idx === 0 && m.role === 'assistant'}>{p.text}</Response>
                  })}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
        </Conversation>
      <ChatInput
        models={models}
        defaultModel={selectedModel}
        placement="page"
        maxWidthClass="max-w-4xl"
        onSubmit={({ text, model, reasoningLevel }) => submit({ text, model, reasoningLevel })}
      />
    </div>
  )
}


