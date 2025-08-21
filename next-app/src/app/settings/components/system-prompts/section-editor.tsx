'use client'

import type { SystemPromptSection } from '../../lib/system-prompts/types'
import { Textarea } from '~/components/ui/textarea'
import { Switch } from '~/components/ui/switch'
import { Label } from '~/components/ui/label'

interface SectionEditorProps {
  section: SystemPromptSection
  onContentChange: (content: string) => void
  onToggle: (enabled: boolean) => void
  disabled?: boolean // For mandatory sections
}

export function SectionEditor({
  section,
  onContentChange,
  onToggle,
  disabled = false
}: SectionEditorProps) {
  return (
    <div className="space-y-3 p-4 border border-[#11393644] rounded-lg bg-[#113936]/5">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-neutral-200">
          {section.title}
          {disabled && <span className="text-xs text-neutral-400 ml-2">(Required)</span>}
        </Label>
        <Switch
          checked={section.enabled}
          onCheckedChange={onToggle}
          disabled={disabled}
        />
      </div>

      {section.enabled && (
        <div className="space-y-2">
          <Textarea
            value={section.content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder={`Enter content for ${section.title.toLowerCase()}...`}
            className="min-h-[80px] resize-none bg-[#113936]/10 border-[#11393644] text-neutral-200 placeholder:text-neutral-500"
          />
        </div>
      )}
    </div>
  )
}

SectionEditor.displayName = 'SectionEditor'
