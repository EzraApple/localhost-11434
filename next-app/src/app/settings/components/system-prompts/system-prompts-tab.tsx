'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { toast } from 'sonner'

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

  const startCreate = () => {
    setEditing({ title: '', content: '' })
    setOpen(true)
  }
  const startEdit = (p: { id: string; title: string; content: string }) => {
    setEditing({ id: p.id, title: p.title, content: p.content })
    setOpen(true)
  }

  const save = async () => {
    if (!editing) return
    const { id, title, content } = editing
    try {
      if (!title.trim() || !content.trim()) {
        toast.error('Title and content are required')
        return
      }
      if (id) {
        await updateMutation.mutateAsync({ id, title, content } as any)
        toast.success('System prompt updated')
      } else {
        await createMutation.mutateAsync({ title, content } as any)
        toast.success('System prompt created')
      }
      setOpen(false)
      setEditing(null)
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
        {prompts.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-3 p-3 hover:bg-[#113936]/10">
            <div className="min-w-0">
              <div className="truncate text-neutral-100">{p.title}</div>
              <div className="truncate text-sm text-neutral-400">{p.content}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" className="h-8 px-2" onClick={() => startEdit(p)}>Edit</Button>
              <Button variant="ghost" className="h-8 px-2 text-red-300 hover:text-red-200" onClick={() => remove(p.id)}>Delete</Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="flex-shrink-0 p-6 pb-0">
            <DialogTitle>{editing?.id ? 'Edit System Prompt' : 'New System Prompt'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-neutral-400">Title</div>
              <Input value={editing?.title ?? ''} onChange={(e) => setEditing(prev => ({ ...(prev as EditablePrompt), title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-neutral-400">Content</div>
              <Textarea 
                className="min-h-[400px] resize-none overflow-y-auto" 
                value={editing?.content ?? ''} 
                onChange={(e) => setEditing(prev => ({ ...(prev as EditablePrompt), content: e.target.value }))} 
                placeholder="Enter your system prompt content here..."
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 p-6 pt-4 border-t border-border flex-shrink-0">
            <Button variant="ghost" className="h-8 px-3" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="h-8 px-3" onClick={save} disabled={createMutation.isPending || updateMutation.isPending}>{editing?.id ? 'Save' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


