import { useCallback, useEffect, useState } from 'react'
import { api } from '~/trpc/react'
import { getCacheManager } from '~/lib/chat-cache'
import type { CachedChat, ChatCacheData, CacheResult, CachedMessage } from '~/lib/chat-cache/types'

/**
 * Hook for cache-first chat data access
 * Replaces usePreloadedChats with IndexedDB + Memory caching
 */
export function useCachedChats() {
  const [isInitialized, setIsInitialized] = useState(false)
  const [allChats, setAllChats] = useState<CachedChat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [recentlyDeletedChats, setRecentlyDeletedChats] = useState<Set<string>>(new Set())

  const cacheManager = getCacheManager()

  // Initialize cache manager on mount
  useEffect(() => {
    let mounted = true

    const initializeCache = async () => {
      console.log('[useCachedChats] Initializing cache system...')
      const startTime = performance.now()
      
      try {
        await cacheManager.initialize()
        
        if (!mounted) return

        // Load all cached chats for sidebar
        const cachedChats = await cacheManager.getAllChats()
        setAllChats(cachedChats)
        setIsInitialized(true)
        
        const elapsed = performance.now() - startTime
        console.log(`[useCachedChats] Cache initialized with ${cachedChats.length} chats (${elapsed.toFixed(2)}ms)`)
        
        // Start background sync to populate cache from SQLite
        backgroundSyncChats()
        
      } catch (err) {
        console.error('[useCachedChats] Failed to initialize cache:', err)
        if (!mounted) return
        setError(err as Error)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    initializeCache()

    return () => {
      mounted = false
    }
  }, [])

  // Get TRPC utils for imperative calls
  const utils = api.useUtils()

  // Background sync to populate cache from SQLite
  const backgroundSyncChats = useCallback(async () => {
    try {
      console.log('[useCachedChats] Starting background sync from SQLite...')
      const startTime = performance.now()
      
      // Fetch fresh chat list from SQLite via TRPC utils
      const chatsResponse = await utils.chats.list.fetch()
      const sqliteChats = chatsResponse.chats

      // Convert SQLite format to cache format, excluding recently deleted chats
      const cacheChats: CachedChat[] = sqliteChats
        .filter(chat => !recentlyDeletedChats.has(chat.id)) // Exclude recently deleted chats
        .map(chat => ({
          id: chat.id,
          title: chat.title,
          createdAt: new Date(chat.createdAt as any),
          lastMessageAt: chat.lastMessageAt ? new Date(chat.lastMessageAt as any) : null,
          pinned: !!chat.pinned,
          pinnedAt: chat.pinnedAt ? new Date(chat.pinnedAt as any) : null,
          lastSetModel: chat.lastSetModel || null,
          lastSetPrompt: chat.lastSetPrompt || null,
          cachedAt: new Date(),
          version: 1,
          isDirty: false,
          messageCount: 0, // Will be updated when messages are loaded
          lastSyncedAt: new Date()
        }))

      // Update local state
      setAllChats(cacheChats)

      // Cache important chats (pinned + recent) with their messages
      const importantChats = cacheChats
        .filter(chat => chat.pinned || chat.lastMessageAt)
        .sort((a, b) => {
          // Pinned first, then by recent activity
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return (b.lastMessageAt?.getTime() || 0) - (a.lastMessageAt?.getTime() || 0)
        })
        .slice(0, 20) // Cache top 20 important chats

      // Fetch messages for important chats and cache them
      let cachedCount = 0
      const batchSize = 3 // Process 3 chats at a time to avoid overwhelming the system

      for (let i = 0; i < importantChats.length; i += batchSize) {
        const batch = importantChats.slice(i, i + batchSize)
        
        await Promise.all(batch.map(async (chat) => {
          try {
            const messagesResponse = await utils.messages.list.fetch({ chatId: chat.id })
            const messages = messagesResponse.messages.map(msg => ({
              id: msg.id,
              chatId: msg.chatId,
              role: msg.role,
              parts: msg.parts,
              createdAt: new Date(msg.createdAt as any),
              index: msg.index,
              cachedAt: new Date(),
              version: 1,
              isDirty: false
            }))

            const chatCacheData: ChatCacheData = {
              chat: { ...chat, messageCount: messages.length },
              messages,
              isComplete: true
            }

            await cacheManager.cacheData(chat.id, chatCacheData)
            cachedCount++
            
            console.log(`[useCachedChats] Cached chat ${chat.id} with ${messages.length} messages`)
          } catch (err) {
            console.warn(`[useCachedChats] Failed to cache chat ${chat.id}:`, err)
          }
        }))

        // Small delay between batches to avoid blocking UI
        if (i + batchSize < importantChats.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      const elapsed = performance.now() - startTime
      console.log(`[useCachedChats] Background sync completed: ${cachedCount}/${importantChats.length} chats cached (${elapsed.toFixed(2)}ms)`)

      // Log cache statistics
      const stats = cacheManager.getStats()
      console.log('[useCachedChats] Cache stats:', stats)

    } catch (err) {
      console.error('[useCachedChats] Background sync failed:', err)
    }
  }, [utils, cacheManager, recentlyDeletedChats])

  // Delete chat from local state and cache
  const deleteChat = useCallback(async (chatId: string): Promise<boolean> => {
    try {
      console.log(`[useCachedChats] Deleting chat ${chatId}...`)
      
      // Add to recently deleted set to prevent background sync from re-adding it
      setRecentlyDeletedChats(prev => new Set([...prev, chatId]))
      
      // Remove from local state immediately
      setAllChats(prev => prev.filter(chat => chat.id !== chatId))
      
      // Remove from cache layers
      const success = await cacheManager.deleteChat(chatId)
      
      if (success) {
        console.log(`[useCachedChats] ✓ Successfully deleted chat ${chatId}`)
        
        // Clear from recently deleted after a delay to ensure server-side deletion completes
        setTimeout(() => {
          setRecentlyDeletedChats(prev => {
            const newSet = new Set(prev)
            newSet.delete(chatId)
            return newSet
          })
        }, 5000) // 5 second grace period
        
      } else {
        console.warn(`[useCachedChats] ⚠️ Failed to delete chat ${chatId} from cache`)
        
        // Remove from recently deleted since deletion failed
        setRecentlyDeletedChats(prev => {
          const newSet = new Set(prev)
          newSet.delete(chatId)
          return newSet
        })
        
        // Re-add to local state if cache deletion failed
        const chatsResponse = await utils.chats.list.fetch()
        const restoredChat = chatsResponse.chats.find(c => c.id === chatId)
        if (restoredChat) {
          const cachedChat: CachedChat = {
            id: restoredChat.id,
            title: restoredChat.title,
            createdAt: new Date(restoredChat.createdAt as any),
            lastMessageAt: restoredChat.lastMessageAt ? new Date(restoredChat.lastMessageAt as any) : null,
            pinned: !!restoredChat.pinned,
            pinnedAt: restoredChat.pinnedAt ? new Date(restoredChat.pinnedAt as any) : null,
            lastSetModel: restoredChat.lastSetModel || null,
            lastSetPrompt: restoredChat.lastSetPrompt || null,
            cachedAt: new Date(),
            version: 1,
            isDirty: false,
            messageCount: 0,
            lastSyncedAt: new Date()
          }
          setAllChats(prev => [...prev, cachedChat])
        }
      }
      
      return success
    } catch (error) {
      console.error(`[useCachedChats] Error deleting chat ${chatId}:`, error)
      
      // Remove from recently deleted on error
      setRecentlyDeletedChats(prev => {
        const newSet = new Set(prev)
        newSet.delete(chatId)
        return newSet
      })
      
      return false
    }
  }, [cacheManager, utils])

  return {
    allChats,
    isInitialized,
    isLoading,
    error,
    cacheManager,
    
    // Delete chat from cache and local state
    deleteChat,
    
    // Force refresh cache from SQLite
    refreshCache: backgroundSyncChats,
    
    // Get cache statistics
    getCacheStats: () => cacheManager.getStats()
  }
}

/**
 * Hook to get cached data for a specific chat
 * Replaces usePreloadedChatData
 */
export function useCachedChatData(chatId: string) {
  const [cacheResult, setCacheResult] = useState<CacheResult<ChatCacheData> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const cacheManager = getCacheManager()
  const utils = api.useUtils()

  useEffect(() => {
    let mounted = true

    const loadChatData = async () => {
      if (!chatId) {
        setIsLoading(false)
        return
      }

      console.log(`[useCachedChatData] Loading data for chat ${chatId}...`)
      setIsLoading(true)

      try {
        // First try cache (memory + IndexedDB)
        const cacheResult = await cacheManager.getChatData(chatId)
        
        if (!mounted) return

        // If cache hit, use cached data
        if (cacheResult.data) {
          setCacheResult(cacheResult)
          
          const source = cacheResult.source === 'memory' ? '🧠' : 
                        cacheResult.source === 'indexeddb' ? '💾' : 
                        cacheResult.source === 'sqlite' ? '🗄️' : '❌'
          
          console.log(`[useCachedChatData] ${source} Loaded chat ${chatId} from ${cacheResult.source} (${cacheResult.loadTime.toFixed(2)}ms)`)
        } else {
          // Cache miss - fetch from SQLite via TRPC
          console.log(`[useCachedChatData] Cache miss for ${chatId}, fetching from SQLite...`)
          const startTime = performance.now()
          
          try {
            const messagesResponse = await utils.messages.list.fetch({ chatId })
            const chatsResponse = await utils.chats.list.fetch()
            const chat = chatsResponse.chats.find(c => c.id === chatId)
            
            if (chat && messagesResponse.messages) {
              const cachedChat: CachedChat = {
                id: chat.id,
                title: chat.title,
                createdAt: new Date(chat.createdAt as any),
                lastMessageAt: chat.lastMessageAt ? new Date(chat.lastMessageAt as any) : null,
                pinned: !!chat.pinned,
                pinnedAt: chat.pinnedAt ? new Date(chat.pinnedAt as any) : null,
                lastSetModel: chat.lastSetModel || null,
                lastSetPrompt: chat.lastSetPrompt || null,
                cachedAt: new Date(),
                version: 1,
                isDirty: false,
                messageCount: messagesResponse.messages.length,
                lastSyncedAt: new Date()
              }

              const cachedMessages = messagesResponse.messages.map(msg => ({
                id: msg.id,
                chatId: msg.chatId,
                role: msg.role,
                parts: msg.parts,
                createdAt: new Date(msg.createdAt as any),
                index: msg.index,
                cachedAt: new Date(),
                version: 1,
                isDirty: false
              }))

              const chatCacheData: ChatCacheData = {
                chat: cachedChat,
                messages: cachedMessages,
                isComplete: true
              }

              // Cache the data for future access
              await cacheManager.cacheData(chatId, chatCacheData)
              
              const loadTime = performance.now() - startTime
              setCacheResult({
                data: chatCacheData,
                source: 'sqlite',
                loadTime,
                fromCache: false
              })
              
              console.log(`[useCachedChatData] 🗄️ Fetched chat ${chatId} from SQLite (${loadTime.toFixed(2)}ms)`)
            } else {
              setCacheResult({
                data: null,
                source: 'not_found',
                loadTime: performance.now() - startTime,
                fromCache: false
              })
            }
          } catch (sqliteError) {
            console.error(`[useCachedChatData] SQLite fetch failed for ${chatId}:`, sqliteError)
            setCacheResult({
              data: null,
              source: 'not_found',
              loadTime: performance.now() - startTime,
              fromCache: false
            })
          }
        }
        
      } catch (err) {
        console.error(`[useCachedChatData] Failed to load chat ${chatId}:`, err)
        if (!mounted) return
        setCacheResult({
          data: null,
          source: 'not_found',
          loadTime: 0,
          fromCache: false
        })
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadChatData()

    return () => {
      mounted = false
    }
  }, [chatId, cacheManager, utils])

  return {
    data: cacheResult?.data || null,
    source: cacheResult?.source || 'not_found',
    loadTime: cacheResult?.loadTime || 0,
    fromCache: cacheResult?.fromCache || false,
    isLoading,
    
    // Check if data exists and is fresh
    isAvailable: Boolean(cacheResult?.data),
    isCacheHit: Boolean(cacheResult?.fromCache),
    
    // Utility to check if data is stale (for backward compatibility)
    isStale: false // Cache manager handles staleness internally
  }
}
