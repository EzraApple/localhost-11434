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
import { Search, X } from 'lucide-react'
import { useChatStore, type ChatListItem } from '~/lib/chat-store'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog'

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
  const { chats, selectedChatId, deleteChat } = useChatStore()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => b.createdAt - a.createdAt),
    [chats]
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sortedChats
    return sortedChats.filter(c => c.title.toLowerCase().includes(q))
  }, [query, sortedChats])
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
        {sortedChats.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-3">
            <div className="text-center text-sm text-muted-foreground">No chats yet</div>
          </div>
        ) : (
          (['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Older'] as const).map(section => (
            groups[section].length ? (
              <SidebarGroup key={section}>
                <SidebarGroupLabel>{section}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {groups[section].map((chat) => (
                      <SidebarMenuItem key={chat.id}>
                        <div className="w-full">
                          <SidebarMenuButton
                            className="w-full flex items-center justify-between"
                            isActive={selectedChatId === chat.id}
                            onClick={() => router.push(`/chat/${chat.id}`)}
                          >
                            <span className="truncate text-[#cde3df]">{chat.title}</span>
                            <span
                              role="button"
                              aria-label="Delete chat"
                              className="rounded-md p-1 text-muted-foreground hover:text-red-500"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmId(chat.id) }}
                            >
                              <X className="h-4 w-4" />
                            </span>
                          </SidebarMenuButton>
                        </div>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null
          ))
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


