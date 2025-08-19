'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import ChatInput from '~/components/chat-input'

type ModelInfo = { name: string }

export default function ChatByIdPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/ollama/models', { cache: 'no-store' })
        const data = await res.json()
        const list: ModelInfo[] = data.models ?? []
        setModels(list)
        if (list.length) setSelectedModel(list[0]!.name)
      } catch (e) {
        console.error('Failed to load models', e)
      }
    }
    load()
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
      <div className="text-lg font-semibold">Chat #{id}</div>
      <div className="flex-1 rounded-lg border border-white/10 bg-neutral-900/30 p-4 flex items-center justify-center text-sm text-neutral-400">
        chat history placeholder
      </div>
      <ChatInput
        models={models}
        defaultModel={selectedModel}
        onSubmit={({ text, model }) => {
          console.log('Prompt Submitted (chat):', text, 'model:', model, 'id:', id)
        }}
      />
    </div>
  )
}


