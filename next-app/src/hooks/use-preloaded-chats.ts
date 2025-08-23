import { api } from "~/trpc/react"

export type PreloadedChatData = {
  messages: Array<{
    id: string
    chatId: string
    role: string
    parts: unknown
    createdAt: Date
    index: number | null
  }>
  messageCount: number
  cachedAt: string
}

export type PreloadedChatsResponse = {
  preloadedChats: Record<string, PreloadedChatData>
  totalChats: number
  cachedAt: string
}

/**
 * Hook to preload chat histories for important chats (pinned + 3 most recent).
 * This hook should be called at a high level in the component tree (like layout)
 * to ensure the cache persists across navigation.
 */
export function usePreloadedChats() {
  return api.chats.preloadImportantChats.useQuery(undefined, {
    // Cache data for 5 minutes - shows immediately on navigation
    staleTime: 5 * 60 * 1000,
    
    // Refetch every 10 minutes to keep data fresh
    refetchInterval: 10 * 60 * 1000,
    
    // Don't refetch when window regains focus (avoid unnecessary requests)
    refetchOnWindowFocus: false,
    
    // Don't refetch on reconnect (data is still valid)
    refetchOnReconnect: false,
    
    // Retry failed requests (network issues)
    retry: 2,
  })
}

/**
 * Utility hook to check if a specific chat is preloaded and get its data.
 * Use this in individual chat components to access preloaded data.
 */
export function usePreloadedChatData(chatId: string) {
  const { data: preloadedData, isLoading, error } = usePreloadedChats()
  
  const isPreloaded = Boolean(preloadedData?.preloadedChats?.[chatId])
  const chatData = preloadedData?.preloadedChats?.[chatId]
  
  return {
    isPreloaded,
    chatData,
    isLoading,
    error,
    // Utility to check if data is stale (older than 30 minutes)
    isStale: chatData ? 
      (Date.now() - new Date(chatData.cachedAt).getTime()) > 30 * 60 * 1000 : 
      false
  }
}
