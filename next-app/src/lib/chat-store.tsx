'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type ChatListItem = {
  id: string
  title: string
  createdAt: number
}

type ChatStore = {
  chats: ChatListItem[]
  selectedChatId: string | null
  createChat: (id: string, title?: string) => void
  renameChat: (id: string, title: string) => void
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

  const createChat = useCallback((id: string, title = 'New Chat') => {
    setChats(prev => [{ id, title, createdAt: Date.now() }, ...prev])
    setSelectedChatId(id)
  }, [])

  const renameChat = useCallback((id: string, title: string) => {
    setChats(prev => prev.map(c => (c.id === id ? { ...c, title } : c)))
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

  const deleteChat = useCallback((id: string) => {
    setChats(prev => prev.filter(c => c.id !== id))
    if (selectedChatId === id) setSelectedChatId(null)
    try {
      sessionStorage.removeItem(`chat:${id}:messages`)
    } catch {}
  }, [selectedChatId])

  const storeValue = useMemo<ChatStore>(() => ({
    chats,
    selectedChatId,
    createChat,
    renameChat,
    selectChat,
    selectedModel,
    setSelectedModel,
    deleteChat,
  }), [chats, selectedChatId, createChat, renameChat, selectChat, selectedModel, setSelectedModel, deleteChat])

  return <ChatStoreContext.Provider value={storeValue}>{children}</ChatStoreContext.Provider>
}

export function useChatStore() {
  const ctx = useContext(ChatStoreContext)
  if (!ctx) throw new Error('useChatStore must be used within ChatStoreProvider')
  return ctx
}


