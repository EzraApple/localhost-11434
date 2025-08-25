'use client'

import { useCallback, useState, useRef } from 'react'

type PreloadCache = Record<string, number> // model -> timestamp of last preload

export function useModelPreload() {
  const [isPreloading, setIsPreloading] = useState(false)
  const cacheRef = useRef<PreloadCache>({})
  const PRELOAD_COOLDOWN = 2 * 60 * 1000 // 2 minutes - don't preload same model within this window

  const preloadModel = useCallback(async (model: string) => {
    console.log(`[preload] preloadModel called with model: "${model}"`)
    
    if (!model) {
      console.log('[preload] No model provided, skipping')
      return
    }
    
    // Check if model was preloaded recently
    const now = Date.now()
    const lastPreload = cacheRef.current[model]
    if (lastPreload && (now - lastPreload) < PRELOAD_COOLDOWN) {
      const timeLeft = Math.ceil((PRELOAD_COOLDOWN - (now - lastPreload)) / 1000)
      console.log(`[preload] Model ${model} already preloaded recently, skipping (${timeLeft}s remaining)`)
      return
    }

    console.log(`[preload] Starting preload for model: ${model}`)
    setIsPreloading(true)
    
    try {
      const startTime = Date.now()
      const response = await fetch('/api/ollama/preload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      })
      
      const duration = Date.now() - startTime
      
      if (response.ok) {
        const result = await response.json()
        cacheRef.current[model] = now
        console.log(`[preload] ✅ Successfully warmed up model ${model} in ${duration}ms:`, result)
      } else {
        const error = await response.json()
        console.warn(`[preload] ❌ Failed to warm up model ${model} after ${duration}ms:`, error)
      }
    } catch (error) {
      console.warn(`[preload] ❌ Network error warming up model ${model}:`, error)
    } finally {
      setIsPreloading(false)
    }
  }, [])

  const getLastPreloadTime = useCallback((model: string): number | null => {
    return cacheRef.current[model] || null
  }, [])

  const isModelWarmedUp = useCallback((model: string): boolean => {
    const lastPreload = cacheRef.current[model]
    if (!lastPreload) return false
    
    // Consider model "warm" for 3 minutes after preload
    const warmupDuration = 3 * 60 * 1000
    return (Date.now() - lastPreload) < warmupDuration
  }, [])

  return {
    preloadModel,
    isPreloading,
    getLastPreloadTime,
    isModelWarmedUp
  }
}
