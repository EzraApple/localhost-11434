'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from '~/components/ui/sidebar'
import { Button } from '~/components/ui/button'
import { Pin, PinOff, Pencil, Search, X } from 'lucide-react'
import { useChatStore, type ChatListItem } from '~/lib/chat-store'
import { useMemo as _useMemoRef, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '~/components/ui/context-menu'
import { api } from '~/trpc/react'

type Buckets = {
  Today: ChatListItem[]
  Yesterday: ChatListItem[]
  'Last 7 Days': ChatListItem[]
  'Last 30 Days': ChatListItem[]
  Older: ChatListItem[]
}

function groupByDate(chats: ChatListItem[]): Buckets {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const startOf7Days = startOfToday - 7 * 24 * 60 * 60 * 1000
  const startOf30Days = startOfToday - 30 * 24 * 60 * 60 * 1000
  const buckets: Buckets = { Today: [], Yesterday: [], 'Last 7 Days': [], 'Last 30 Days': [], Older: [] }
  for (const c of chats) {
    if (c.createdAt >= startOfToday) buckets['Today'].push(c)
    else if (c.createdAt >= startOfYesterday) buckets['Yesterday'].push(c)
    else if (c.createdAt >= startOf7Days) buckets['Last 7 Days'].push(c)
    else if (c.createdAt >= startOf30Days) buckets['Last 30 Days'].push(c)
    else buckets['Older'].push(c)
  }
  return buckets
}

export function ChatSelectSidebar() {
  const router = useRouter()
  const { chats, selectedChatId, deleteChat, renameChat, pinChat } = useChatStore()
  const { isLoading: isLoadingChats } = api.chats.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5_000
  })
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)

  const pinned = useMemo(() => chats.filter(c => c.pinned), [chats])
  const unpinnedSorted = useMemo(
    () => chats.filter(c => !c.pinned).sort((a, b) => b.createdAt - a.createdAt),
    [chats]
  )
  const filteredPinned = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pinned
    return pinned.filter(c => c.title.toLowerCase().includes(q))
  }, [query, pinned])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return unpinnedSorted
    return unpinnedSorted.filter(c => c.title.toLowerCase().includes(q))
  }, [query, unpinnedSorted])
  const groups = useMemo(() => groupByDate(filtered), [filtered])

  return (
    <Sidebar variant="inset" className="">
      <SidebarHeader>
        <div className="px-3 pt-3">
          <div className="flex h-10 items-center justify-center">
            <div className="select-none text-[--wordmark-color]">
              <span className="text-lg font-semibold tracking-wide">Ollama&nbsp;Desk</span>
            </div>
          </div>
        </div>
        <div className="px-3 pb-2">
          <Button
            onClick={() => router.push('/')}
            className="w-full h-10 rounded-md font-semibold text-[#d3e6e2] backdrop-blur-md bg-[linear-gradient(180deg,rgba(19,49,45,0.64),rgba(14,31,29,0.64))] outline outline-1 outline-[#113936]/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_rgba(0,0,0,0.3)] transition-colors hover:bg-[#11554e] hover:bg-none"
            variant="secondary"
          >
            New Chat
          </Button>
        </div>
        <div className="px-3 pb-0">
          <div className="flex items-center gap-3">
            <Search className="-ml-[3px] mr-1 h-4 w-4 text-muted-foreground" />
            <input
              role="searchbox"
              aria-label="Search threads"
              placeholder="Search your threads..."
              className="w-full bg-transparent py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <SidebarSeparator className="mx-3" />
      </SidebarHeader>
      <SidebarContent>
        {isLoadingChats ? (
          <div className="flex flex-1 items-center justify-center px-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-3">
            <div className="text-center text-sm text-muted-foreground">No chats yet</div>
          </div>
        ) : (
          <>
          {filteredPinned.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Pinned</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredPinned.map((chat) => (
                    <SidebarMenuItem key={chat.id}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div className="w-full">
                            <SidebarMenuButton
                              className="group/chat w-full flex items-center justify-between"
                              isActive={selectedChatId === chat.id}
                              onClick={() => router.push(`/chat/${chat.id}`)}
                              onDoubleClick={() => setRenamingId(chat.id)}
                            >
                              {renamingId === chat.id ? (
                                <input
                                  ref={renameInputRef}
                                  className="w-full bg-transparent outline-none border-b border-border"
                                  defaultValue={chat.title}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const value = (e.target as HTMLInputElement).value.trim()
                                      if (value && value !== chat.title) renameChat(chat.id, value)
                                      setRenamingId(null)
                                    } else if (e.key === 'Escape') {
                                      setRenamingId(null)
                                    }
                                  }}
                                  onBlur={() => setRenamingId(null)}
                                  autoFocus
                                />
                              ) : (
                                <span className="truncate text-[#cde3df]">{chat.title}</span>
                              )}
                              <div className="flex items-center gap-1 opacity-0 translate-x-2 group-hover/chat:opacity-100 group-hover/chat:translate-x-0 transition-all duration-200">
                                <span
                                  role="button"
                                  aria-label="Unpin chat"
                                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); pinChat(chat.id, false) }}
                                  title="Unpin chat"
                                >
                                  <PinOff className="h-4 w-4" />
                                </span>
                                <span
                                  role="button"
                                  aria-label="Delete chat"
                                  className="rounded-md p-1 text-muted-foreground hover:text-red-500"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmId(chat.id) }}
                                  title="Delete chat"
                                >
                                  <X className="h-4 w-4" />
                                </span>
                              </div>
                            </SidebarMenuButton>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => setRenamingId(chat.id)}>
                            <Pencil className="mr-2 h-4 w-4" /> Rename chat
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => pinChat(chat.id, false)}>
                            <PinOff className="mr-2 h-4 w-4" /> Unpin chat
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          {( ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Older'] as const).map(section => (
            groups[section].length ? (
              <SidebarGroup key={section}>
                <SidebarGroupLabel>{section}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {groups[section].map((chat) => (
                      <SidebarMenuItem key={chat.id}>
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div className="w-full">
                              <SidebarMenuButton
                                className="group/chat w-full flex items-center justify-between"
                                isActive={selectedChatId === chat.id}
                                onClick={() => router.push(`/chat/${chat.id}`)}
                                onDoubleClick={() => setRenamingId(chat.id)}
                              >
                                {renamingId === chat.id ? (
                                  <input
                                    ref={renameInputRef}
                                    className="w-full bg-transparent outline-none border-b border-border"
                                    defaultValue={chat.title}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const value = (e.target as HTMLInputElement).value.trim()
                                        if (value && value !== chat.title) renameChat(chat.id, value)
                                        setRenamingId(null)
                                      } else if (e.key === 'Escape') {
                                        setRenamingId(null)
                                      }
                                    }}
                                    onBlur={() => setRenamingId(null)}
                                    autoFocus
                                  />
                                ) : (
                                  <span className="truncate text-[#cde3df]">{chat.title}</span>
                                )}
                                <div className="flex items-center gap-1 opacity-0 translate-x-2 group-hover/chat:opacity-100 group-hover/chat:translate-x-0 transition-all duration-200">
                                  <span
                                    role="button"
                                    aria-label="Pin chat"
                                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); pinChat(chat.id, true) }}
                                    title="Pin chat"
                                  >
                                    <Pin className="h-4 w-4" />
                                  </span>
                                  <span
                                    role="button"
                                    aria-label="Delete chat"
                                    className="rounded-md p-1 text-muted-foreground hover:text-red-500"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmId(chat.id) }}
                                    title="Delete chat"
                                  >
                                    <X className="h-4 w-4" />
                                  </span>
                                </div>
                              </SidebarMenuButton>
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem onClick={() => setRenamingId(chat.id)}>
                              <Pencil className="mr-2 h-4 w-4" /> Rename chat
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => pinChat(chat.id, true)}>
                              <Pin className="mr-2 h-4 w-4" /> Pin chat
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null
          ))}
          </>
        )}
      </SidebarContent>
      {/* <SidebarFooter>
      </SidebarFooter> */}
      <Dialog open={!!confirmId} onOpenChange={(open: boolean) => { if (!open) setConfirmId(null) }}>
        <DialogContent>
          <DialogTitle>Delete chat?</DialogTitle>
          <DialogDescription>
            This will permanently remove the selected chat. This action cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (confirmId) {
                const deletingActive = selectedChatId === confirmId
                deleteChat(confirmId)
                setConfirmId(null)
                if (deletingActive) router.push('/')
              }
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}


