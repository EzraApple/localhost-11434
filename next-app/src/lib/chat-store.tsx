'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { api } from '~/trpc/react'
import { useCachedChats } from '~/hooks/use-cached-chats'

export type ChatListItem = {
  id: string
  title: string
  createdAt: number
  pinned?: boolean
  lastSetModel?: string | null
  lastSetPrompt?: string | null
}

type ChatStore = {
  chats: ChatListItem[]
  selectedChatId: string | null
  createChat: (id: string, title?: string, model?: string) => void
  renameChat: (id: string, title: string) => void
  pinChat: (id: string, pinned: boolean) => void
  setLastSetPrompt: (id: string, promptId: string | null) => void
  selectChat: (id: string | null) => void
  selectedModel: string | null
  setSelectedModel: (model: string) => void
  deleteChat: (id: string) => void
}

const ChatStoreContext = createContext<ChatStore | null>(null)

export function ChatStoreProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatListItem[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [selectedModel, setSelectedModelState] = useState<string | null>(null)

  // Use new cache-first chat system (replaces usePreloadedChats + direct TRPC)
  const { allChats: cachedChats, isInitialized: cacheInitialized, cacheManager } = useCachedChats()
  
  // Fallback to TRPC for initial load if cache is not ready
  const { data: chatsData } = api.chats.list.useQuery(undefined, { 
    enabled: !cacheInitialized,
    refetchOnWindowFocus: false, 
    staleTime: 5_000 
  })
  
  const utils = api.useUtils()
  import('react').then(({ useEffect }) => {
    // TS appeasement for hook placement; actual effect below
  })
  
  // Hydrate chats from cache-first system
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('react').useEffect(() => {
    console.log('[ChatStore] Hydrating chats...', { cacheInitialized, cachedChatsLength: cachedChats.length, hasTrpcData: !!chatsData?.chats })
    
    if (cacheInitialized && cachedChats.length > 0) {
      // Use cached data (fastest path)
      console.log('[ChatStore] ✓ Using cached chats:', cachedChats.length)
      setChats(cachedChats.map(c => ({ 
        id: c.id, 
        title: c.title, 
        createdAt: c.createdAt.getTime(), 
        pinned: !!c.pinned, 
        lastSetModel: c.lastSetModel,
        lastSetPrompt: c.lastSetPrompt
      })))
    } else if (chatsData?.chats) {
      // Fallback to TRPC data
      console.log('[ChatStore] ⚠️ Fallback to TRPC chats:', chatsData.chats.length)
      setChats(chatsData.chats.map(c => ({ 
        id: c.id, 
        title: c.title, 
        createdAt: new Date(c.createdAt as any).getTime(), 
        pinned: !!c.pinned, 
        lastSetModel: (c as any).lastSetModel ?? null, 
        lastSetPrompt: (c as any).lastSetPrompt ?? null 
      })))
    }
  }, [cacheInitialized, cachedChats, chatsData?.chats])

  const createChatMutation = api.chats.create.useMutation()
  const createChat = useCallback((id: string, title = 'New Chat', model?: string) => {
    setChats(prev => [{ id, title, createdAt: Date.now(), lastSetModel: model || null, lastSetPrompt: null }, ...prev])
    setSelectedChatId(id)
    // fire-and-forget server create
    createChatMutation.mutate({ id, title, model } as any, {
      onError: () => {
        // rollback optimistic add on error
        setChats(prev => prev.filter(c => c.id !== id))
      },
    })
  }, [createChatMutation])

  const renameChatMutation = api.chats.rename.useMutation()
  const renameChat = useCallback((id: string, title: string) => {
    const old = chats.find(c => c.id === id)
    setChats(prev => prev.map(c => (c.id === id ? { ...c, title } : c)))
    
    // Update cache immediately (optimistic update)
    if (cacheManager) {
      console.log(`[ChatStore] Updating cached chat title: ${id} -> "${title}"`)
      // Note: This would require extending the cache manager API
      // For now, we'll rely on the next cache refresh
    }
    
    renameChatMutation.mutate({ id, title } as any, {
      onSuccess: () => {
        console.log(`[ChatStore] ✓ Renamed chat ${id} successfully`)
        // Invalidate TRPC caches
        utils.chats.list.invalidate()
        // Cache updates handled automatically by cache system
        // Cache will be updated on next refresh
      },
      onError: () => {
        console.warn(`[ChatStore] ✗ Failed to rename chat ${id}, rolling back`)
        if (old) setChats(prev => prev.map(c => (c.id === id ? old : c)))
      },
    })
  }, [chats, renameChatMutation, utils, cacheManager])

  const pinChatMutation = api.chats.pin.useMutation()
  const pinChat = useCallback((id: string, pinned: boolean) => {
    const old = chats.find(c => c.id === id)
    setChats(prev => prev.map(c => (c.id === id ? { ...c, pinned } : c)))
    
    console.log(`[ChatStore] ${pinned ? 'Pinning' : 'Unpinning'} chat ${id}`)
    
    pinChatMutation.mutate({ id, pinned } as any, {
      onSuccess: () => {
        console.log(`[ChatStore] ✓ ${pinned ? 'Pinned' : 'Unpinned'} chat ${id} successfully`)
        // Invalidate TRPC caches
        utils.chats.list.invalidate()
        // Cache updates handled automatically by cache system
        // Cache will be updated on next refresh
      },
      onError: () => {
        console.warn(`[ChatStore] ✗ Failed to ${pinned ? 'pin' : 'unpin'} chat ${id}, rolling back`)
        if (old) setChats(prev => prev.map(c => (c.id === id ? old : c)))
      },
    })
  }, [chats, pinChatMutation, utils])

  const setLastSetPrompt = useCallback((id: string, promptId: string | null) => {
    setChats(prev => prev.map(c => (c.id === id ? { ...c, lastSetPrompt: promptId } : c)))
  }, [])

  const selectChat = useCallback((id: string | null) => {
    setSelectedChatId(id)
  }, [])

  const setSelectedModel = useCallback((model: string) => {
    setSelectedModelState(model)
    try {
      localStorage.setItem('ollama:selectedModel', model)
    } catch {}
  }, [])

  // initialize model from storage
  import('react').then(({ useEffect }) => {
    // noop to satisfy TS import placement; actual effect below
  })
  // eslint-disable-next-line react-hooks/rules-of-hooks
  require('react').useEffect(() => {
    try {
      const m = localStorage.getItem('ollama:selectedModel')
      if (m) setSelectedModelState(m)
    } catch {}
  }, [])

  const deleteChatMutation = api.chats.delete.useMutation()
  const deleteChat = useCallback((id: string) => {
    const prevChats = chats
    setChats(prev => prev.filter(c => c.id !== id))
    if (selectedChatId === id) setSelectedChatId(null)
    
    console.log(`[ChatStore] Deleting chat ${id}`)
    
    // Remove from cache immediately
    if (cacheManager) {
      console.log(`[ChatStore] Removing chat ${id} from cache...`)
      cacheManager.deleteChat(id).catch(err => {
        console.warn(`[ChatStore] Failed to remove chat ${id} from cache:`, err)
      })
    }
    
    deleteChatMutation.mutate({ id } as any, {
      onSuccess: () => {
        console.log(`[ChatStore] ✓ Deleted chat ${id} successfully`)
        // Invalidate TRPC caches
        utils.chats.list.invalidate()
        // Cache updates handled automatically by cache system
      },
      onError: () => {
        console.warn(`[ChatStore] ✗ Failed to delete chat ${id}, rolling back`)
        setChats(prevChats)
        // TODO: Re-add to cache if deletion failed
      },
    })
  }, [chats, deleteChatMutation, selectedChatId, utils, cacheManager])

  const storeValue = useMemo<ChatStore>(() => ({
    chats,
    selectedChatId,
    createChat,
    renameChat,
    pinChat,
    setLastSetPrompt,
    selectChat,
    selectedModel,
    setSelectedModel,
    deleteChat,
  }), [chats, selectedChatId, createChat, renameChat, pinChat, setLastSetPrompt, selectChat, selectedModel, setSelectedModel, deleteChat])

  return <ChatStoreContext.Provider value={storeValue}>{children}</ChatStoreContext.Provider>
}

export function useChatStore() {
  const ctx = useContext(ChatStoreContext)
  if (!ctx) throw new Error('useChatStore must be used within ChatStoreProvider')
  return ctx
}


