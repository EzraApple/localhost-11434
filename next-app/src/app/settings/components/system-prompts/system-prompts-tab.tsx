'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import type { StructuredSystemPrompt } from '../../lib/system-prompts/types'
import {
  createEmptyStructuredPrompt,
  updateSectionContent,
  toggleSection,
  buildFinalPrompt
} from '../../lib/system-prompts/builder'

type EditablePrompt = { id?: string; title: string; content: string }

export default function SystemPromptsTab() {
  const { data, refetch, error, isLoading } = api.systemPrompts.list.useQuery()
  const createMutation = api.systemPrompts.create.useMutation()
  const updateMutation = api.systemPrompts.update.useMutation()
  const deleteMutation = api.systemPrompts.delete.useMutation()

  const prompts = useMemo(() => data?.prompts ?? [], [data?.prompts])

  useEffect(() => {
    if (error) toast.error('Failed to load system prompts', { description: String((error as any)?.message || error) })
  }, [error])

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EditablePrompt | null>(null)
  const [structuredPrompt, setStructuredPrompt] = useState<StructuredSystemPrompt | null>(null)
  const [useBuilder, setUseBuilder] = useState(true)

  const startCreate = () => {
    setEditing({ title: '', content: '' })
    setStructuredPrompt(createEmptyStructuredPrompt())

    setUseBuilder(true)
    setOpen(true)
  }

  const startEdit = (p: { id: string; title: string; content: string; sections: any }) => {
    const { id, title, content, sections } = p
    setEditing({ id, title, content })

    // Use structured format directly
    let structured: StructuredSystemPrompt
    if (sections) {
      // Has structured data, use it directly
      structured = {
        id,
        title,
        sections,
        userInfo: '',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    } else {
      // Legacy format, convert to structured
      structured = createEmptyStructuredPrompt()
      structured.id = id
      structured.title = title
    }

    setStructuredPrompt(structured)
    setUseBuilder(true) // Start with builder mode for structured prompts
    setOpen(true)
  }

  const save = async () => {
    if (!editing) return

    try {
      let title = editing.title
      let content = editing.content
      let sections = null

      // If using builder, construct the content from structured prompt
      if (useBuilder && structuredPrompt) {
        title = structuredPrompt.title
        content = buildFinalPrompt(structuredPrompt)
        sections = structuredPrompt.sections
      }

      if (!title.trim() || !content.trim()) {
        toast.error('Title and content are required')
        return
      }

      const promptData = { title, content, sections }

      if (editing.id) {
        await updateMutation.mutateAsync({ id: editing.id, ...promptData } as any)
        toast.success('System prompt updated')
      } else {
        await createMutation.mutateAsync(promptData as any)
        toast.success('System prompt created')
      }

      setOpen(false)
      setEditing(null)
      setStructuredPrompt(null)
  
      await refetch()
    } catch (e) {
      const msg = (e as Error).message
      toast.error('Save failed', { description: msg })
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteMutation.mutateAsync({ id } as any)
      toast.success('System prompt deleted')
      await refetch()
    } catch (e) {
      toast.error('Delete failed', { description: (e as Error).message })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-300">Create reusable system prompts and pick them in chat.</div>
        <Button onClick={startCreate} className="h-8 px-3">New Prompt</Button>
      </div>
      <div className="divide-y divide-[#11393644] rounded-md border border-[#11393644]">
        {isLoading && (
          <div className="p-4 text-sm text-neutral-400">Loading…</div>
        )}
        {!isLoading && prompts.length === 0 && (
          <div className="p-4 text-sm text-neutral-400">No prompts yet.</div>
        )}
        {prompts.map(p => {
          // Get active sections from structured data or detect from content
          const getActiveSections = () => {
            if (p.sections) {
              // Use structured data if available
              const sections = []
              if (p.sections.identityRole?.enabled) sections.push('Identity')
              if (p.sections.instructions?.enabled) sections.push('Instructions')
              if (p.sections.constraints?.enabled) sections.push('Constraints')
              if (p.sections.outputFormatting?.enabled) sections.push('Formatting')
              if (p.sections.userContext?.enabled) sections.push('User Context')
              return sections.length > 0 ? sections : ['Custom']
            } else {
              // Fallback to content detection for legacy prompts
              const sections = []
              if (p.content.toLowerCase().includes('you are') || p.content.toLowerCase().includes('assistant')) {
                sections.push('Identity')
              }
              if (p.content.toLowerCase().includes('respond') || p.content.toLowerCase().includes('communication')) {
                sections.push('Instructions')
              }
              if (p.content.toLowerCase().includes('format') || p.content.toLowerCase().includes('code block')) {
                sections.push('Formatting')
              }
              if (p.content.toLowerCase().includes('do not') || p.content.toLowerCase().includes('avoid')) {
                sections.push('Constraints')
              }
              if (p.content.toLowerCase().includes('user') || p.content.toLowerCase().includes('context')) {
                sections.push('User Context')
              }
              return sections.length > 0 ? sections : ['Custom']
            }
          }

          const activeSections = getActiveSections()

          return (
                      <div key={p.id} className="group relative flex items-center gap-3 p-3 hover:bg-[#113936]/10 cursor-pointer" onClick={() => startEdit(p)}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-neutral-100">{p.title}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {activeSections.map((section, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#113936]/30 text-[#22c55e] border border-[#113936]/50"
                    >
                      {section}
                    </span>
                  ))}
                </div>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-neutral-400 hover:text-[#d3e6e2] hover:bg-[#113936]/20"
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(p.id)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="flex-shrink-0 p-6 pb-0">
            <DialogTitle>{editing?.id ? 'Edit System Prompt' : 'Create System Prompt'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
            {/* Editor Mode Toggle */}
            <div className="flex items-center justify-between p-3 bg-[#113936]/5 rounded-lg border border-[#11393633]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
                <span className="text-sm font-medium text-neutral-200">Editor Mode</span>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#0a1f1f]/50 rounded-md">
                <Button
                  variant={useBuilder ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setUseBuilder(true)}
                  className="h-7 px-3 text-xs"
                >
                  Builder
                </Button>
                <Button
                  variant={!useBuilder ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setUseBuilder(false)}
                  className="h-7 px-3 text-xs"
                >
                  Simple
                </Button>
              </div>
            </div>

            {useBuilder ? (
              // Builder Mode
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-neutral-200">Prompt Title</Label>
                  <Input
                    value={structuredPrompt?.title ?? ''}
                    onChange={(e) => {
                      if (structuredPrompt) {
                        setStructuredPrompt(prev => ({ ...prev!, title: e.target.value }))
                      }
                    }}
                    placeholder="Enter a descriptive title for your system prompt..."
                    className="bg-[#113936]/10 border-[#11393644] text-neutral-200 placeholder:text-neutral-500 focus:border-[#22c55e]/50 focus:ring-1 focus:ring-[#22c55e]/20"
                  />
                </div>
                {structuredPrompt && (
                  <div className="space-y-6">
                    {/* Header with subtle styling */}
                    <div className="pb-2 border-b border-[#11393633]">
                      <p className="text-sm text-neutral-400">
                        Configure your system prompt using structured sections. Toggle sections on/off and customize their content.
                      </p>
                    </div>

                    {/* Sections with improved spacing and design */}
                    <div className="space-y-3">
                      {/* Display sections in specific order: identity, user-context, instructions, formatting, constraints */}
                      {[
                        structuredPrompt.sections.identityRole,
                        structuredPrompt.sections.userContext,
                        structuredPrompt.sections.instructions,
                        structuredPrompt.sections.outputFormatting,
                        structuredPrompt.sections.constraints
                      ].map((section) => (
                        <div key={section.id} className="group relative">
                          <div className="flex items-center justify-between p-3 bg-[#113936]/5 hover:bg-[#113936]/10 rounded-lg border border-[#11393633] transition-all duration-200">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${section.enabled ? 'bg-[#22c55e]' : 'bg-neutral-500'}`} />
                              <Label className="text-sm font-medium text-neutral-100">
                                {section.title}
                              </Label>
                              {section.id === 'identity-role' && (
                                <span className="text-xs text-[#22c55e] bg-[#22c55e]/10 px-2 py-0.5 rounded">
                                  Required
                                </span>
                              )}
                            </div>
                            <Switch
                              checked={section.enabled}
                              onCheckedChange={(enabled) => {
                                const updated = toggleSection(structuredPrompt, section.id, enabled)
                                setStructuredPrompt(updated)
                              }}
                              disabled={section.id === 'identity-role'}
                            />
                          </div>

                          {section.enabled && (
                            <div className="mt-2 p-3 bg-[#0a1f1f]/50 rounded-lg border border-[#11393633]">
                              <Textarea
                                value={section.content}
                                onChange={(e) => {
                                  const updated = updateSectionContent(structuredPrompt, section.id, e.target.value)
                                  setStructuredPrompt(updated)
                                }}
                                placeholder={`Configure ${section.title.toLowerCase()}...`}
                                className="min-h-[80px] resize-none bg-transparent border-[#11393644] text-neutral-200 placeholder:text-neutral-500 focus:border-[#22c55e]/50 focus:ring-1 focus:ring-[#22c55e]/20"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Preview with improved design */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
                        <Label className="text-sm font-medium text-neutral-100">Final Prompt Preview</Label>
                      </div>
                      <div className="p-4 bg-[#0a1f1f]/70 rounded-lg border border-[#11393644] backdrop-blur-sm">
                        <div className="text-xs text-neutral-500 mb-3 font-medium">
                          Combined system prompt that will be sent to the model:
                        </div>
                        <Textarea
                          value={buildFinalPrompt(structuredPrompt)}
                          readOnly
                          className="min-h-[120px] resize-none bg-transparent border-0 text-neutral-300 font-mono text-sm p-0 shadow-none focus:ring-0"
                          placeholder="Enable sections to see the combined prompt..."
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Simple Mode (Legacy)
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-neutral-200">Prompt Title</Label>
                  <Input
                    value={editing?.title ?? ''}
                    onChange={(e) => setEditing(prev => ({ ...(prev as EditablePrompt), title: e.target.value }))}
                    placeholder="Enter a descriptive title for your system prompt..."
                    className="bg-[#113936]/10 border-[#11393644] text-neutral-200 placeholder:text-neutral-500 focus:border-[#22c55e]/50 focus:ring-1 focus:ring-[#22c55e]/20"
                  />
            </div>
            <div className="space-y-2">
                  <Label className="text-sm font-medium text-neutral-200">Prompt Content</Label>
              <Textarea 
                    className="min-h-[400px] resize-none overflow-y-auto bg-[#113936]/10 border-[#11393644] text-neutral-200 placeholder:text-neutral-500 focus:border-[#22c55e]/50 focus:ring-1 focus:ring-[#22c55e]/20"
                value={editing?.content ?? ''} 
                onChange={(e) => setEditing(prev => ({ ...(prev as EditablePrompt), content: e.target.value }))} 
                placeholder="Enter your system prompt content here..."
              />
            </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 p-6 pt-4 border-t border-border flex-shrink-0">
            <Button variant="ghost" className="h-8 px-3" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              className="h-8 px-3"
              onClick={save}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


