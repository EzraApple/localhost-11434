'use client'

import { useEffect, useMemo, useState } from 'react'

export type ModelCapabilities = {
  model: string
  capabilities: { completion: boolean; vision: boolean }
  think: { supported: boolean; levels: ('low' | 'medium' | 'high')[] }
}

export function useOllamaModelCapabilities(model?: string) {
  const [data, setData] = useState<ModelCapabilities | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    if (!model) {
      setData(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch('/api/ollama/model-capabilities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(String(json?.error || `Failed to fetch capabilities for ${model}`))
        if (!cancelled) setData(json as ModelCapabilities)
      } catch (e) {
        if (!cancelled) setError(e as Error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [model])

  const thinkLevels = useMemo(() => new Set((data?.think.levels ?? []) as ('low' | 'medium' | 'high')[]), [data])

  return { data, error, loading, thinkLevels }
}


