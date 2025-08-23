'use client'

import { useEffect, useState } from 'react'
import { api } from '~/trpc/react'
import type { ModelCapabilities } from './use-ollama-model-capabilities'

type CapabilitiesCache = Record<string, ModelCapabilities>

export function useModelCapabilitiesCache(models: Array<{ name: string }>) {
  const [cache, setCache] = useState<CapabilitiesCache>({})
  const [loadingModels, setLoadingModels] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Error[]>([])
  const utils = api.useUtils()
  
  const getCapabilities = (modelName: string): ModelCapabilities | null => {
    return cache[modelName] || null
  }
  
  // Fetch capabilities for models not in cache
  useEffect(() => {
    const modelsToFetch = models.filter(model => 
      model.name && !cache[model.name] && !loadingModels.has(model.name)
    )
    
    if (modelsToFetch.length === 0) return
    
    // Mark models as loading
    setLoadingModels(prev => {
      const newSet = new Set(prev)
      modelsToFetch.forEach(model => newSet.add(model.name))
      return newSet
    })
    
    // Fetch capabilities for each model
    const fetchPromises = modelsToFetch.map(async (model) => {
      try {
        const capabilities = await utils.models.capabilities.fetch({ model: model.name })
        
        setCache(prevCache => ({
          ...prevCache,
          [model.name]: capabilities as ModelCapabilities
        }))
        
        setLoadingModels(prev => {
          const newSet = new Set(prev)
          newSet.delete(model.name)
          return newSet
        })
      } catch (error) {
        setErrors(prev => [...prev, error as Error])
        setLoadingModels(prev => {
          const newSet = new Set(prev)
          newSet.delete(model.name)
          return newSet
        })
      }
    })
    
    Promise.all(fetchPromises).catch(() => {
      // Individual errors are handled above
    })
  }, [models, cache, loadingModels, utils])
  
  return {
    getCapabilities,
    cache,
    isLoading: loadingModels.size > 0,
    errors
  }
}
