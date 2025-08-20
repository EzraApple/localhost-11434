import { NextResponse } from "next/server";
import { Ollama } from "ollama";

const client = new Ollama({ host: "http://127.0.0.1:11434" });

export async function POST(req: Request) {
  try {
    const { model, messages, think, reasoningLevel } = (await req.json()) as {
      model: string;
      messages: { role: "system" | "user" | "assistant" | "tool"; content: string }[];
      think?: boolean | "low" | "medium" | "high";
      reasoningLevel?: "low" | "medium" | "high";
    };

    const stream = await client.chat({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      think: (reasoningLevel as any) ?? think ?? false,
    });

    let finalReasoning = "";
    let finalText = "";

    // Streaming math delimiter normalization state
    let inCodeFence = false; // ``` fence
    let inInlineCode = false; // ` inline
    let mathPhase: 'none' | 'inline' | 'display' = 'none';
    let carry = ""; // carry over partial tokens across chunks (e.g., '\', '`', '``')

    const normalizeMathDelimiters = (chunk: string): string => {
      // Prepend any carry from last pass
      let s = carry + chunk;
      carry = "";
      let out = "";
      for (let i = 0; i < s.length; ) {
        const c = s[i];
        const c2 = i + 1 < s.length ? s[i + 1] : '';
        const c3 = i + 2 < s.length ? s[i + 2] : '';

        // Handle trailing partial tokens: if last char is '\\' or last two are '``', stash and break
        if (i === s.length - 1) {
          if (c === '\\') {
            carry = '\\';
            break;
          }
        }
        if (i === s.length - 2) {
          if (c === '`' && c2 === '`') {
            carry = '``';
            break;
          }
        }

        // Code fence ``` toggling (only when not in inline code)
        if (!inInlineCode && c === '`' && c2 === '`' && c3 === '`') {
          inCodeFence = !inCodeFence;
          out += '```';
          i += 3;
          continue;
        }

        // Inline code ` toggling (ignore if inside code fence)
        if (!inCodeFence && c === '`') {
          inInlineCode = !inInlineCode;
          out += '`';
          i += 1;
          continue;
        }

        if (!inCodeFence && !inInlineCode) {
          // Math delimiter conversions
          if (c === '\\' && c2 === '(' && mathPhase === 'none') {
            mathPhase = 'inline';
            out += '$';
            i += 2;
            continue;
          }
          if (c === '\\' && c2 === ')' && mathPhase === 'inline') {
            mathPhase = 'none';
            out += '$';
            i += 2;
            continue;
          }
          if (c === '\\' && c2 === '[' && mathPhase === 'none') {
            mathPhase = 'display';
            out += '$$';
            i += 2;
            continue;
          }
          if (c === '\\' && c2 === ']' && mathPhase === 'display') {
            mathPhase = 'none';
            out += '$$';
            i += 2;
            continue;
          }
        }

        // Default: passthrough
        out += c;
        i += 1;
      }
      return out;
    };

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const part of stream as any) {
            const thinking: string | undefined = part?.message?.thinking;
            const content: string | undefined = part?.message?.content;
            if (thinking && thinking.length > 0) {
              finalReasoning += thinking;
              const norm = normalizeMathDelimiters(thinking);
              controller.enqueue(encoder.encode(JSON.stringify({ kind: "reasoning", text: norm }) + "\n"));
            }
            if (content && content.length > 0) {
              finalText += content;
              const norm = normalizeMathDelimiters(content);
              controller.enqueue(encoder.encode(JSON.stringify({ kind: "text", text: norm }) + "\n"));
            }
          }
        } catch (err) {
          controller.error(err);
          return;
        }

        // log final combined message on server
        const combined = (finalReasoning ? `[thinking]\n${finalReasoning}\n[/thinking]\n` : "") + finalText;
        // eslint-disable-next-line no-console
        console.log("[ollama] final assistant message:", combined);

        controller.enqueue(encoder.encode(JSON.stringify({ kind: "done" }) + "\n"));
        controller.close();
      },
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}


