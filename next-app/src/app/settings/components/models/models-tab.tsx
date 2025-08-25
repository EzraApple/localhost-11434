'use client'

import { useMemo, useState } from 'react'
import { api } from '~/trpc/react'
import { Separator } from '~/components/ui/separator'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { useOllamaModelCapabilities } from '~/hooks/use-ollama-model-capabilities'
import { Brain, Image as ImageIcon, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'

export default function ModelsTab() {
  const { data, error, isLoading, refetch } = api.models.list.useQuery()
  const models = data?.models ?? []
  const totalBytes = useMemo(() => models.reduce((acc, m) => acc + (m.size || 0), 0), [models])
  const toSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '—'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 0.1) return `${gb.toFixed(2)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const [pending, setPending] = useState<Record<string, number | null>>({})
  const startPull = async (name: string) => {
    if (!name) return
    setPending((p) => ({ ...p, [name]: null }))
    try {
      toast.info(`Starting pull for ${name}`)
      const res = await fetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name }),
      })
      if (!res.ok || !res.body) throw new Error('Failed to start pull')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue
          let obj: any
          try { obj = JSON.parse(line) } catch { continue }
          if (obj.kind === 'progress') {
            const pct = typeof obj.percent === 'number' ? obj.percent : null
            setPending((p) => ({ ...p, [name]: pct }))
          } else if (obj.kind === 'done') {
            setPending((p) => {
              const n = { ...p }
              delete n[name]
              return n
            })
            // refresh installed list
            await refetch()
            toast.success(`Pulled ${name}`)
          } else if (obj.kind === 'error') {
            setPending((p) => {
              const n = { ...p }
              delete n[name]
              return n
            })
            toast.error(`Pull failed for ${name}`)
          }
        }
      }
    } catch {
      setPending((p) => {
        const n = { ...p }
        delete n[name]
        return n
      })
      toast.error(`Pull failed for ${name}`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-300">Storage used</div>
        <div className="text-sm font-medium text-neutral-100">{toSize(totalBytes)}</div>
      </div>
      <Separator />
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-200">Available models</h3>
        <div className="divide-y divide-white/5 rounded-lg border border-white/10">
          {isLoading ? (
            <div className="p-3 text-sm text-neutral-400">Loading…</div>
          ) : error ? (
            <div className="p-3 text-sm text-red-300">{String((error as any)?.message || 'Failed to load models')}</div>
          ) : models.length === 0 ? (
            Object.keys(pending).length === 0 ? (
              <div className="p-3 text-sm text-neutral-400">No models installed</div>
            ) : null
          ) : (
            models.map((m) => (
              <ModelRow key={m.name} name={m.name} meta={{ family: m.family, parameterSize: m.parameterSize, quantization: m.quantization }} size={m.size} onRemoved={refetch} isPulling={m.name in pending} />
            ))
          )}
          {Object.entries(pending).map(([name, pct]) => (
            <ModelRow key={`pending:${name}`} name={name} meta={{}} size={undefined} pendingPercent={pct} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-200">Pull a model</h3>
        <PullModel onStartPull={startPull} />
      </section>
    </div>
  )
}

function ModelRow({ name, meta, size, pendingPercent, onRemoved, isPulling }: { name: string; meta: { family?: string; parameterSize?: string; quantization?: string }; size?: number; pendingPercent?: number | null; onRemoved?: () => void; isPulling?: boolean }) {
  const isPending = typeof pendingPercent === 'number' || isPulling
  const { data } = useOllamaModelCapabilities(isPending ? undefined : name)
  const showQuery = api.models.show.useQuery(
    { model: name },
    { 
      enabled: !isPending && !!name, 
      staleTime: 60_000,
      retry: false // Don't retry failed requests for downloading models
    }
  ) as any
  const removeMutation = api.models.remove.useMutation()
  // Only show capabilities for non-pending models
  const hasThink = !isPending && (data?.think.supported ?? false)
  const hasVision = !isPending && (data?.capabilities.vision ?? false)
  const hasTools = !isPending && (data?.capabilities.tools ?? false)
  const toSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '—'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 0.1) return `${gb.toFixed(2)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }
  const toCtx = () => {
    // Don't try to get context for pending models
    if (isPending) return '—'
    
    const data = showQuery?.data as any
    const show = data?.details || {}
    // 1) model_info.*.context_length (e.g., llama.context_length)
    let n: number | undefined
    const info = show?.model_info && typeof show.model_info === 'object' ? show.model_info as Record<string, any> : {}
    for (const [k, v] of Object.entries(info)) {
      if (/context_length$/i.test(k) && typeof v === 'number' && isFinite(v) && v > 0) {
        n = v
        break
      }
    }
    // 2) try common option fields if present on the root show object
    if (!n) {
      const fromOptions = show?.options?.num_ctx || show?.num_ctx || show?.context_length || show?.context || show?.max_context
      n = typeof fromOptions === 'number' ? fromOptions : parseInt(String(fromOptions ?? ''), 10)
      if (!isFinite(n as number)) n = undefined
    }
    // 3) parse modelfile (parameter num_ctx ...)
    if (!n && typeof show?.modelfile === 'string') {
      const mf: string = show.modelfile
      const m = mf.match(/parameter\s+num_ctx\s+(\d+)/i) || mf.match(/\bnum_ctx\s+(\d+)/i)
      if (m && m[1]) {
        const parsed = parseInt(m[1], 10)
        if (Number.isFinite(parsed) && parsed > 0) n = parsed
      }
    }
    if (n !== undefined && Number.isFinite(n) && n > 0) {
      const k = Math.round(n / 100) / 10
      return `${k}k tokens`
    }
    return '—'
  }
  return (
    <div className="group flex items-center justify-between p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-neutral-100">{name}</div>
        <div className="truncate text-xs text-neutral-400">
          {(meta.family || '—')} · {(meta.parameterSize || '—')} · {(meta.quantization || '—')} · {toCtx()}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {isPending ? (
          <div className="w-40">
            {typeof pendingPercent === 'number' ? (
              <>
                <div className="h-1.5 w-full rounded bg-white/10 overflow-hidden">
                  <div className="h-1.5 bg-emerald-400" style={{ width: `${pendingPercent}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-neutral-300">Pulling… {pendingPercent}%</div>
              </>
            ) : (
              <div className="text-[10px] text-neutral-300">Finalizing…</div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span title={hasThink ? 'Supports thinking' : 'No thinking support'} className={hasThink ? 'text-emerald-300' : 'text-neutral-500'}>
                <Brain className="h-4 w-4 inline" />
              </span>
              <span title={hasVision ? 'Supports vision' : 'No vision support'} className={hasVision ? 'text-emerald-300' : 'text-neutral-500'}>
                <ImageIcon className="h-4 w-4 inline" />
              </span>
              <span title={hasTools ? 'Supports tool calling' : 'No tool calling support'} className={hasTools ? 'text-emerald-300' : 'text-neutral-500'}>
                <Wrench className="h-4 w-4 inline" />
              </span>
            </div>
            <div className="text-xs text-neutral-300">{toSize(size)}</div>
            <ConfirmRemove
              name={name}
              onConfirm={async () => {
                try {
                  await removeMutation.mutateAsync({ model: name })
                  toast.success(`Removed ${name}`)
                  onRemoved?.()
                } catch (e) {
                  toast.error(`Failed to remove ${name}`, { description: String((e as Error).message || e) })
                }
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}

function ConfirmRemove({ name, onConfirm }: { name: string; onConfirm: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-red-400"
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
        >
          ×
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove model</DialogTitle>
          <DialogDescription>
            This will delete the local files for <span className="font-medium">{name}</span>. You can pull it again later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive" asChild={false}
            onClick={async () => {
              await onConfirm()
              setOpen(false)
            }}
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PullModel({ onStartPull }: { onStartPull?: (name: string) => void }) {
  const [name, setName] = useState('')
  const onPull = async () => {
    if (!name.trim()) return
    onStartPull?.(name.trim())
    setName('')
  }
  return (
    <div className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. llama3.2:1b" className="h-8" />
      <Button size="sm" onClick={onPull}>Pull</Button>
    </div>
  )
}


