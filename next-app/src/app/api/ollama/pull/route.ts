import { NextResponse } from "next/server"
import { Ollama } from "ollama"

const client = new Ollama({ host: "http://127.0.0.1:11434" })

type PullProgress = {
  status?: string
  total?: number
  completed?: number
  digest?: string
}

export async function POST(req: Request) {
  try {
    const { model, insecure } = (await req.json()) as { model?: string; insecure?: boolean }
    if (!model || typeof model !== "string") {
      return NextResponse.json({ error: "Missing 'model'" }, { status: 400 })
    }

    let stream: AsyncIterable<PullProgress>
    try {
      stream = (await client.pull({ model, insecure: !!insecure, stream: true } as any)) as any
    } catch (e: unknown) {
      const err = e as Error
      const isConnRefused = /ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(String(err.message))
      const msg = isConnRefused
        ? "Cannot connect to Ollama at 127.0.0.1:11434. Start Ollama (ollama serve)."
        : `Failed to start pull: ${err.message}`
      return NextResponse.json({ error: msg, code: isConnRefused ? "OLLAMA_UNAVAILABLE" : "OLLAMA_PULL_ERROR" }, { status: 503 })
    }

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder()
        let lastPercent = -1
        try {
          for await (const part of stream as any) {
            const status = String(part?.status ?? "")
            const total = typeof part?.total === "number" ? part.total : undefined
            const completed = typeof part?.completed === "number" ? part.completed : undefined
            const digest = part?.digest ? String(part.digest) : undefined
            let percent: number | undefined
            if (typeof total === "number" && typeof completed === "number" && total > 0) {
              percent = Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
            }
            const payload: any = { kind: "progress", status, total, completed, percent, digest }
            // avoid flooding with identical percent
            if (typeof percent === 'number') {
              if (percent === lastPercent) continue
              lastPercent = percent
            }
            controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"))
          }
        } catch (err) {
          controller.enqueue(encoder.encode(JSON.stringify({ kind: "error", error: String((err as Error).message) }) + "\n"))
          controller.error(err)
          return
        }
        controller.enqueue(encoder.encode(JSON.stringify({ kind: "done" }) + "\n"))
        controller.close()
      },
    })

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err: unknown) {
    const e = err as Error
    const isConnRefused = /ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(String(e.message))
    const msg = isConnRefused
      ? "Cannot connect to Ollama at 127.0.0.1:11434. Start Ollama (ollama serve)."
      : `Unexpected server error: ${e.message}`
    return NextResponse.json({ error: msg, code: isConnRefused ? "OLLAMA_UNAVAILABLE" : "SERVER_ERROR" }, { status: 500 })
  }
}


