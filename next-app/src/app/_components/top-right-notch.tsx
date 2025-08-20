"use client"

import { Settings } from "lucide-react"
import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"

export default function TopRightNotch({ className }: { className?: string }) {

  return (
    <div className={cn("pointer-events-auto absolute top-2 right-2 z-10", className)}>
      {/* The notch shape uses two opposing rounded corners to visually separate from the edges */}
      <div
        className={cn(
          "flex items-center gap-1 border md:border-[#b08aa144] border-[#b08aa133] shadow-sm",
          "bg-[hsl(320,20%,3%)]/80 supports-[backdrop-filter]:bg-[hsl(320,20%,3%)]/60 backdrop-blur",
          // Opposing radiused corners: top-left and bottom-right
          "rounded-tl-xl rounded-br-xl rounded-tr-md rounded-bl-md px-1.5 py-1"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-neutral-200 hover:text-white hover:bg-white/10"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Settings</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}


