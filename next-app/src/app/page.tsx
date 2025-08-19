"use client"

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import ChatInput from '~/components/chat-input'

type ModelInfo = { name: string }

export default function Home() {
  const router = useRouter()
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
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <ChatInput
          models={models}
          defaultModel={selectedModel}
          onSubmit={({ text, model }) => {
            const id = crypto.randomUUID()
            console.log('Landing prompt submitted:', text, 'model:', model, 'id:', id)
            router.push(`/chat/${id}`)
          }}
        />
      </div>
    </div>
  )
}
