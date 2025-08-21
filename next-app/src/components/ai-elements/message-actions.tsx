'use client'

import { useState } from 'react'
import { Copy, Edit, RotateCcw, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { ScrollArea } from '~/components/ui/scroll-area'
import { api } from '~/trpc/react'
import type { UIMessage } from '~/lib/chat-types'

export type MessageActionsProps = {
  message: UIMessage
  isEditing?: boolean
  onEdit?: (messageId: string) => void
  onRetry?: (messageId: string, model?: string) => void
  onEditCancel?: () => void
  className?: string
}

export function MessageActions({ message, isEditing, onEdit, onRetry, onEditCancel, className }: MessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const { data: modelsData } = api.models.list.useQuery()
  const models = modelsData?.models ?? []

  const handleCopy = async () => {
    try {
      const textContent = message.parts
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n')
      
      await navigator.clipboard.writeText(textContent)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy to clipboard')
    }
  }

  const handleEdit = () => {
    if (isEditing) {
      // If already editing, cancel without saving
      onEditCancel?.()
    } else {
      // Start editing
      onEdit?.(message.id)
    }
  }

  const handleRetry = (model?: string) => {
    onRetry?.(message.id, model)
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Copy button - always available */}
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        title="Copy message"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>

      {/* Edit button - only for user messages */}
      {message.role === 'user' && (
        <button
          onClick={handleEdit}
          className={`p-1.5 rounded-md transition-colors ${
            isEditing 
              ? 'text-foreground bg-accent/70' 
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          }`}
          title={isEditing ? "Cancel edit" : "Edit message"}
        >
          <Edit className="h-4 w-4" />
        </button>
      )}

      {/* Retry button - only for assistant messages and not in edit mode */}
      {message.role === 'assistant' && !isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors flex items-center"
              title="Retry message"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => handleRetry()}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry Same Model
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="py-1">
              <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
                Retry with different model:
              </div>
              <ScrollArea className="h-32">
                {models.map((model) => (
                  <DropdownMenuItem
                    key={model.name}
                    onClick={() => handleRetry(model.name)}
                    className="ml-2"
                  >
                    {model.name}
                  </DropdownMenuItem>
                ))}
              </ScrollArea>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
