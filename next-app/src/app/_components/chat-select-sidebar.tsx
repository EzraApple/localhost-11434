'use client'

import { useMemo, useState } from 'react'
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

type ChatItem = {
  id: string
  title: string
  createdAt: number
}

export function ChatSelectSidebar() {
  const router = useRouter()
  const [chats] = useState<ChatItem[]>([])

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => b.createdAt - a.createdAt),
    [chats]
  )

  return (
    <Sidebar className="border-r">
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 px-1 pt-4">
          <div className="text-sm font-semibold">Conversations</div>
          <SidebarTrigger />
        </div>
        <Button
          onClick={() => router.push('/')}
          className="w-full"
          variant="secondary"
        >
          New Chat
        </Button>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sortedChats.map((chat) => (
                <SidebarMenuItem key={chat.id}>
                  <SidebarMenuButton onClick={() => router.push(`/chat/${chat.id}`)}>
                    <span className="truncate">{chat.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="text-xs text-muted-foreground px-2">
          {sortedChats.length ? `${sortedChats.length} chats` : 'No chats yet'}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}


