import { NextResponse } from "next/server";
import { Ollama } from "ollama";

const client = new Ollama({ host: "http://127.0.0.1:11434" });

export async function POST(req: Request) {
  try {
    const { model, firstMessage, maxLen } = (await req.json()) as {
      model: string;
      firstMessage: string;
      maxLen?: number;
    };
    const prompt = `Generate a concise, single-line chat title (max 60 chars) for this first user message. No quotes, no punctuation at the end.\n\nMessage:\n"""${firstMessage}"""`;
    const res = (await client.chat({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    })) as any;
    let title = String(res?.message?.content ?? "").trim();
    // strip think blocks if present
    title = title.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '').trim()
    // also strip LaTeX delimiters if any leaked
    title = title.replace(/\$\$?|\\[()\[\]]/g, '').trim()
    const limit = maxLen ?? 60;
    if (title.length > limit) title = title.slice(0, limit - 1) + "…";
    if (!title) title = "New Chat";
    return NextResponse.json({ title });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}


