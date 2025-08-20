"use client"

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '~/trpc/react'
import { useChatStore } from '~/lib/chat-store'
import ChatInput from '~/components/chat-input'

type ModelInfo = { name: string }

export default function Home() {
  const router = useRouter()
  const { createChat, selectChat, selectedModel: storedModel, setSelectedModel } = useChatStore()
  const { data } = api.ollama.listModels.useQuery()
  const models: ModelInfo[] = data?.models ?? []
  const [selectedModel, setSelectedModelState] = useState(storedModel ?? '')
  useEffect(() => {
    if (models.length && !selectedModel) {
      const m = storedModel ?? models[0]!.name
      setSelectedModelState(m)
      setSelectedModel(m)
    }
  }, [models, selectedModel, setSelectedModel, storedModel])

  const basePrompts: string[] = [
    'Summarize this document',
    'Draft an email to the team about the product update',
    'Explain this code and suggest improvements',
    'Generate test cases for this function',
  ]

  const [prefill, setPrefill] = useState<string>('')

  return (
    <div className="relative min-h-dvh pb-40">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(closest-corner at 120px 36px, rgba(14, 78, 71, 0.16), rgba(14, 78, 71, 0.08)), linear-gradient(rgb(12, 24, 25) 15%, rgb(8, 14, 15))' }} />
        <div className="absolute inset-0 bg-noise" />
        <div className="absolute inset-0 bg-[#0a1616]/30" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-[calc(max(15vh,2.5rem))]">
        <h2 className="text-3xl font-semibold">How can I help you?</h2>
        <div className="flex flex-row flex-wrap gap-2.5 text-sm">
          {basePrompts.map((p) => (
            <button
              key={p}
              className="h-9 rounded-full px-5 py-2 font-semibold outline outline-1 outline-[#113936]/50 bg-[#113936]/15 text-[#d3e6e2] hover:bg-[#113936]/25"
              type="button"
              onClick={() => setPrefill(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <ChatInput
        models={models}
        defaultModel={selectedModel}
        prefillText={prefill}
        placement="page"
        maxWidthClass="max-w-3xl"
        onSubmit={({ text, model }) => {
          const id = crypto.randomUUID()
          createChat(id, 'New Chat')
          selectChat(id)
          setSelectedModel(model)
          // store initial prompt in sessionStorage to avoid URL params
          try { sessionStorage.setItem(`chat:${id}:initial`, JSON.stringify({ q: text, m: model })) } catch {}
          router.push(`/chat/${id}`)
        }}
      />
    </div>
  )
}
