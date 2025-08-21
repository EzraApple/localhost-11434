'use client'

import { useState, useRef, useEffect } from 'react'
import { Textarea } from '~/components/ui/textarea'
import { cn } from '~/lib/utils'

export type MessageEditProps = {
  initialText: string
  onSave: (newText: string) => void
  onCancel: () => void
  className?: string
}

export function MessageEdit({ initialText, onSave, onCancel, className }: MessageEditProps) {
  const [text, setText] = useState(initialText)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Focus and select all text when entering edit mode
    if (textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
      // Auto-resize to content
      adjustHeight()
    }
  }, [])

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    adjustHeight()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  const handleSave = () => {
    const trimmedText = text.trim()
    if (trimmedText && trimmedText !== initialText) {
      onSave(trimmedText)
    } else {
      onCancel()
    }
  }

  return (
    <Textarea
      ref={textareaRef}
      value={text}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={cn(
        'resize-none border-0 bg-transparent overflow-hidden',
        'focus-visible:ring-0 focus-visible:ring-offset-0',
        'text-sm leading-relaxed w-full',
        'min-h-[1.25rem]', // Single line minimum
        className
      )}
      placeholder="Edit your message..."
      rows={1}
    />
  )
}
