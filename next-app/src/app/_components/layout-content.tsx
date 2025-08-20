"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"
import { ChatSelectSidebar } from "~/app/_components/chat-select-sidebar"
import TopRightNotch from "~/app/_components/top-right-notch"

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname.startsWith("/settings")) {
    return <>{children}</>
  }

  return (
    <SidebarProvider>
      <ChatSelectSidebar />
      <SidebarInset className="h-dvh overflow-y-auto md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-[#113936]">
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'radial-gradient(closest-corner at 120px 36px, rgba(12, 78, 70, 0.20), rgba(12, 78, 70, 0.10)), linear-gradient(rgb(9, 18, 20) 15%, rgb(5, 10, 11))',
              }}
            />
            <div className="absolute inset-0 bg-noise" />
            <div className="absolute inset-0 bg-[#0b1515]/40" />
          </div>
          <div className="relative">
            <div className="sticky top-0 z-10 pointer-events-none">
              <TopRightNotch />
            </div>
            <div className="relative z-0">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}


