import { NextResponse } from "next/server";
import { Ollama } from "ollama";
import { db } from "~/server/db";
import { $Enums } from "@prisma/client";

const client = new Ollama({ host: "http://127.0.0.1:11434" });

export async function POST(req: Request) {
  try {
    const { model, messages, think, reasoningLevel, chatId, assistantMessageId, userMessageId } = (await req.json()) as {
      model: string;
      messages: { role: "system" | "user" | "assistant" | "tool"; content: string; images?: string[] }[];
      think?: boolean | "low" | "medium" | "high";
      reasoningLevel?: "low" | "medium" | "high";
      chatId?: string;
      assistantMessageId?: string;
      userMessageId?: string;
    };

    let stream: AsyncIterable<any> | undefined;
    try {
      const formattedMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.images && m.images.length > 0 ? { images: m.images } : {})
      }));

      // Debug logging
      console.log("[ollama] formatted messages:", formattedMessages.map(m => ({
        role: m.role,
        content: m.content?.substring(0, 100) + (m.content && m.content.length > 100 ? '...' : ''),
        hasImages: !!(m as any).images?.length
      })));

      stream = await client.chat({
        model,
        messages: formattedMessages,
        stream: true,
        think: (reasoningLevel as any) ?? think ?? false,
      });
    } catch (e: unknown) {
      const err = e as Error;
      const isConnRefused = /ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(String(err.message));
      const msg = isConnRefused
        ? "Cannot connect to Ollama at 127.0.0.1:11434. Start Ollama (ollama serve) and ensure the host is reachable."
        : `Failed to start chat stream: ${err.message}`;
      return NextResponse.json({ error: msg, code: isConnRefused ? "OLLAMA_UNAVAILABLE" : "OLLAMA_CHAT_ERROR" }, { status: 503 });
    }

    let finalReasoning = "";
    let finalText = "";

    // Optional DB persistence setup for assistant message during stream
    const shouldPersist = !!(chatId && assistantMessageId);
    if (shouldPersist) {
      try {
        // ensure chat exists to satisfy FK
        await db.chat.upsert({
          where: { id: chatId as string },
          update: {},
          create: { id: chatId as string, title: "New Chat" },
        });
        await db.message.upsert({
          where: { id: assistantMessageId as string },
          update: {},
          create: {
            id: assistantMessageId as string,
            chatId: chatId as string,
            role: $Enums.MessageRole.ASSISTANT,
            parts: [],
          },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[ollama] failed to upsert assistant message start:", (e as Error).message);
      }
    }

    let lastPersistAt = 0;
    const minPersistIntervalMs = 250;
    const persistAssistant = async () => {
      if (!shouldPersist) return;
      const now = Date.now();
      if (now - lastPersistAt < minPersistIntervalMs) return;
      lastPersistAt = now;
      const parts: { type: "reasoning" | "text"; text: string }[] = [];
      if (finalReasoning) parts.push({ type: "reasoning", text: finalReasoning });
      if (finalText) parts.push({ type: "text", text: finalText });
      try {
        await db.message.update({
          where: { id: assistantMessageId as string },
          data: { parts: parts as unknown as object },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[ollama] failed to persist assistant message:", (e as Error).message);
      }
    };

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
            // opportunistically persist assistant progress
            await persistAssistant();
          }
        } catch (err) {
          const message = `Streaming error: ${(err as Error).message}`;
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ kind: "error", error: message }) + "\n"));
          controller.error(err);
          return;
        }

        // log final combined message on server
        const combined = (finalReasoning ? `[thinking]\n${finalReasoning}\n[/thinking]\n` : "") + finalText;
        // eslint-disable-next-line no-console
        console.log("[ollama] final assistant message:", combined);

        // Final persistence and chat activity update
        if (shouldPersist) {
          try {
            const parts: { type: "reasoning" | "text"; text: string }[] = [];
            if (finalReasoning) parts.push({ type: "reasoning", text: finalReasoning });
            if (finalText) parts.push({ type: "text", text: finalText });
            await db.message.update({
              where: { id: assistantMessageId as string },
              data: { parts: parts as unknown as object },
            });
            await db.chat.update({
              where: { id: chatId as string },
              data: { lastMessageAt: new Date() },
            });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("[ollama] failed to finalize assistant message:", (e as Error).message);
          }
        }

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
    const e = err as Error;
    const isConnRefused = /ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(String(e.message));
    const msg = isConnRefused
      ? "Cannot connect to Ollama at 127.0.0.1:11434. Start Ollama (ollama serve)."
      : `Unexpected server error: ${e.message}`;
    return NextResponse.json({ error: msg, code: isConnRefused ? "OLLAMA_UNAVAILABLE" : "SERVER_ERROR" }, { status: 500 });
  }
}


