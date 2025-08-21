'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { api } from '~/trpc/react'

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

  // hydrate chats from server
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: chatsData } = api.chats.list.useQuery(undefined, { refetchOnWindowFocus: false, staleTime: 5_000 })
  import('react').then(({ useEffect }) => {
    // TS appeasement for hook placement; actual effect below
  })
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('react').useEffect(() => {
    if (chatsData?.chats) {
      setChats(chatsData.chats.map(c => ({ id: c.id, title: c.title, createdAt: new Date(c.createdAt as any).getTime(), pinned: !!c.pinned, lastSetModel: (c as any).lastSetModel ?? null, lastSetPrompt: (c as any).lastSetPrompt ?? null })))
    }
  }, [chatsData?.chats])

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
    renameChatMutation.mutate({ id, title } as any, {
      onError: () => {
        if (old) setChats(prev => prev.map(c => (c.id === id ? old : c)))
      },
    })
  }, [chats, renameChatMutation])

  const pinChatMutation = api.chats.pin.useMutation()
  const pinChat = useCallback((id: string, pinned: boolean) => {
    const old = chats.find(c => c.id === id)
    setChats(prev => prev.map(c => (c.id === id ? { ...c, pinned } : c)))
    pinChatMutation.mutate({ id, pinned } as any, {
      onError: () => {
        if (old) setChats(prev => prev.map(c => (c.id === id ? old : c)))
      },
    })
  }, [chats, pinChatMutation])

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
    deleteChatMutation.mutate({ id } as any, {
      onError: () => {
        setChats(prevChats)
      },
    })
  }, [chats, deleteChatMutation, selectedChatId])

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


