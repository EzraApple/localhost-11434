import { NextResponse } from "next/server";
import { Ollama } from "ollama";
import { db } from "~/server/db";
import { $Enums } from "@prisma/client";
import { toolRegistry } from "~/lib/tools";
import { modelsService } from "~/lib/models/service";

const client = new Ollama({ host: "http://127.0.0.1:11434" });

// Helper function to execute tools
async function executeTools(toolCalls: any[]): Promise<any[]> {
  const results = [];
  
  for (const toolCall of toolCalls) {
    const { name, arguments: args } = toolCall;
    
    try {
      const result = await toolRegistry.execute(name, args);
      results.push({
        id: toolCall.id || crypto.randomUUID(),
        name: name,
        result: result,
        error: undefined
      });
    } catch (error) {
      results.push({
        id: toolCall.id || crypto.randomUUID(),
        name: name,
        result: undefined,
        error: error instanceof Error ? error.message : 'Unknown tool execution error'
      });
    }
  }
  
  return results;
}

// Helper function to determine current phase based on stream content
function determinePhase(part: any): 'reasoning' | 'response' {
  // If the part contains thinking content, it's reasoning phase
  if (part?.message?.thinking) {
    return 'reasoning';
  }
  
  // If we have text content but no thinking, it's response phase
  if (part?.message?.content) {
    return 'response';
  }
  
  // For tool calls, we'll need to track this based on when they occur
  // Default to reasoning for safety
  return 'reasoning';
}

export async function POST(req: Request) {
  try {
    const { model, messages, think, reasoningLevel, chatId, assistantMessageId, userMessageId, enableTools = true } = (await req.json()) as {
      model: string;
      messages: { role: "system" | "user" | "assistant" | "tool"; content: string; images?: string[]; tool_calls?: any[] }[];
      think?: boolean | "low" | "medium" | "high";
      reasoningLevel?: "low" | "medium" | "high";
      chatId?: string;
      assistantMessageId?: string;
      userMessageId?: string;
      enableTools?: boolean;
    };

    let stream: AsyncIterable<any> | undefined;

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

        // Format messages within stream scope
        const formattedMessages = messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.images && m.images.length > 0 ? { images: m.images } : {})
        }));

                       // Check if model supports tools before enabling them
               let modelSupportsTools = false;
               if (enableTools) {
                 try {
                   const capabilities = await modelsService.getCapabilities(model);
                   modelSupportsTools = capabilities.capabilities.tools;
                   console.log(`[ollama] Model ${model} tools support:`, modelSupportsTools);
                 } catch (e) {
                   console.warn(`[ollama] Failed to check tool capabilities for ${model}:`, e);
                   modelSupportsTools = false;
                 }
               }

               // Get available tools if enabled and model supports them
               const availableTools = enableTools && modelSupportsTools ? toolRegistry.list() : [];
               const ollamaTools = availableTools.map(tool => ({
                 type: 'function',
                 function: {
                   name: tool.name,
                   description: tool.description,
                   parameters: tool.parameters
                 }
               }));

        // Initialize the Ollama stream
        try {
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
            keep_alive: '8m', // Keep model in memory during active conversation
            ...(ollamaTools.length > 0 ? { tools: ollamaTools } : {}), // Only include tools if we have any
          });
        } catch (e: unknown) {
          const err = e as Error;
          const isConnRefused = /ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(String(err.message));
          const msg = isConnRefused
            ? "Cannot connect to Ollama at 127.0.0.1:11434. Start Ollama (ollama serve) and ensure the host is reachable."
            : `Failed to start chat stream: ${err.message}`;
          controller.enqueue(encoder.encode(JSON.stringify({ kind: "error", error: msg }) + "\n"));
          controller.error(err);
          return;
        }

        // Main stream processing function that handles tool calls and continuations
        const processOllamaStream = async (
          streamToProcess: AsyncIterable<any>,
          messagesSoFar: any[],
          phaseTracker: { current: 'reasoning' | 'response' } = { current: 'reasoning' }
        ): Promise<void> => {
          try {
            for await (const part of streamToProcess) {
              // Handle regular reasoning content
              const thinking: string | undefined = part?.message?.thinking;
              if (thinking && thinking.length > 0) {
                phaseTracker.current = 'reasoning';
                finalReasoning += thinking;
                const norm = normalizeMathDelimiters(thinking);
                controller.enqueue(encoder.encode(JSON.stringify({ kind: "reasoning", text: norm }) + "\n"));
              }

              // Handle regular text content
              const content: string | undefined = part?.message?.content;
              if (content && content.length > 0) {
                phaseTracker.current = 'response';
                finalText += content;
                const norm = normalizeMathDelimiters(content);
                controller.enqueue(encoder.encode(JSON.stringify({ kind: "text", text: norm }) + "\n"));
              }

              // 🔥 Handle tool calls - this is the key functionality
              if (part?.message?.tool_calls && part.message.tool_calls.length > 0) {
                const toolCalls = part.message.tool_calls;

                // Generate consistent IDs for tool calls and results
                const toolCallsWithIds = toolCalls.map((tc: any) => ({
                  ...tc,
                  id: tc.id || crypto.randomUUID()
                }));

                // Stream tool calls to UI
                for (const toolCall of toolCallsWithIds) {
                  const toolCallData = {
                    kind: "tool_call",
                    toolCall: {
                      id: toolCall.id,
                      name: toolCall.function?.name || toolCall.name,
                      arguments: toolCall.function?.arguments || toolCall.arguments || {},
                      phase: phaseTracker.current
                    }
                  };
                  console.log('[API] Streaming tool call:', toolCallData);
                  controller.enqueue(encoder.encode(JSON.stringify(toolCallData) + "\n"));
                }

                // Execute tools using the same IDs
                const toolResults = await executeTools(toolCallsWithIds.map((tc: any) => ({
                  id: tc.id,
                  name: tc.function?.name || tc.name,
                  arguments: tc.function?.arguments || tc.arguments || {}
                })));

                // Stream tool results to UI
                for (const result of toolResults) {
                  const toolResultData = {
                    kind: "tool_result",
                    toolResult: {
                      id: result.id,
                      result: result.result,
                      error: result.error,
                      phase: phaseTracker.current
                    }
                  };
                  console.log('[API] Streaming tool result:', toolResultData);
                  controller.enqueue(encoder.encode(JSON.stringify(toolResultData) + "\n"));
                }

                // Signal stream continuation
                controller.enqueue(encoder.encode(JSON.stringify({ kind: "stream_continue" }) + "\n"));

                // Create updated message history with tool calls and results
                const assistantMessageWithTools = {
                  role: 'assistant',
                  content: finalText,
                  ...(finalReasoning ? { thinking: finalReasoning } : {}),
                  tool_calls: toolCalls
                };

                const toolMessages = toolResults.map(result => ({
                  role: 'tool',
                  name: result.name,
                  content: JSON.stringify(result.result || { error: result.error })
                }));

                const updatedMessages = [
                  ...messagesSoFar,
                  assistantMessageWithTools,
                  ...toolMessages
                ];

                // Start new stream with tool results - this continues the conversation
                const newStream = await client.chat({
                  model,
                  messages: updatedMessages,
                  stream: true,
                  think: (reasoningLevel as any) ?? think ?? false,
                  keep_alive: '8m',
                  ...(ollamaTools.length > 0 ? { tools: ollamaTools } : {}),
                });

                // Recursively process the new stream
                return await processOllamaStream(newStream, updatedMessages, phaseTracker);
              }

              // Opportunistically persist assistant progress
              await persistAssistant();
            }
          } catch (err) {
            const message = `Streaming error: ${(err as Error).message}`;
            controller.enqueue(encoder.encode(JSON.stringify({ kind: "error", error: message }) + "\n"));
            controller.error(err);
            return;
          }
        };

        // Start processing the initial stream
        try {
          await processOllamaStream(stream as any, formattedMessages);
        } catch (err) {
          const message = `Stream processing error: ${(err as Error).message}`;
          controller.enqueue(encoder.encode(JSON.stringify({ kind: "error", error: message }) + "\n"));
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


