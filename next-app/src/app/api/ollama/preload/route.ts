import { NextResponse } from "next/server";
import { Ollama } from "ollama";

const client = new Ollama({ host: "http://127.0.0.1:11434" });

export async function POST(req: Request) {
  try {
    const { model, keepAlive = '3m' } = (await req.json()) as {
      model: string;
      keepAlive?: string;
    };

    console.log(`[preload-api] Received preload request for model: "${model}", keepAlive: ${keepAlive}`);

    if (!model) {
      console.log('[preload-api] No model provided, returning 400');
      return NextResponse.json({ error: "Model is required" }, { status: 400 });
    }

    try {
      const startTime = Date.now();
      console.log(`[preload-api] Starting Ollama generate call for model: ${model}`);
      
      // Minimal generation call to warm up the model in memory
      await client.generate({
        model,
        prompt: '', // Empty prompt - just loads the model
        options: {
          num_predict: 1, // Generate only 1 token (minimal processing)
          temperature: 0, // Deterministic for consistency
        },
        keep_alive: keepAlive, // Keep model in memory for specified duration
        stream: false
      });

      const duration = Date.now() - startTime;
      console.log(`[preload-api] ✅ Successfully preloaded model ${model} in ${duration}ms`);

      return NextResponse.json({ 
        success: true, 
        model, 
        keepAlive,
        duration,
        message: `Model ${model} preloaded and will stay in memory for ${keepAlive}` 
      });
    } catch (e: unknown) {
      const err = e as Error;
      const isConnRefused = /ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(String(err.message));
      const msg = isConnRefused
        ? "Cannot connect to Ollama at 127.0.0.1:11434. Start Ollama (ollama serve) and ensure the host is reachable."
        : `Failed to preload model: ${err.message}`;
      return NextResponse.json({ 
        error: msg, 
        code: isConnRefused ? "OLLAMA_UNAVAILABLE" : "OLLAMA_PRELOAD_ERROR" 
      }, { status: 503 });
    }
  } catch (err: unknown) {
    const e = err as Error;
    return NextResponse.json({ 
      error: `Unexpected server error: ${e.message}`, 
      code: "SERVER_ERROR" 
    }, { status: 500 });
  }
}
