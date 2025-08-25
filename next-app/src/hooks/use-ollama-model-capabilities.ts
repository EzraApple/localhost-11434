'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '~/trpc/react'

export type ModelCapabilities = {
  model: string
  capabilities: { completion: boolean; vision: boolean; tools: boolean }
  think: { supported: boolean; levels: ('low' | 'medium' | 'high')[] }
}

export function useOllamaModelCapabilities(model?: string) {
  const enabled = !!model
  const { data, error, isLoading } = api.models.capabilities.useQuery(
    { model: model as string },
    { enabled }
  ) as unknown as { data: ModelCapabilities | undefined; error: Error | null; isLoading: boolean }

  const thinkLevels = useMemo(() => new Set(((data?.think.levels ?? []) as ('low' | 'medium' | 'high')[])), [data])

  return { data: data ?? null, error, loading: isLoading, thinkLevels }
}


