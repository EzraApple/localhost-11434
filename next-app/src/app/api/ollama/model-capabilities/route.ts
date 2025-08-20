import { NextResponse } from "next/server";
import { Ollama } from "ollama";

const client = new Ollama({ host: "http://127.0.0.1:11434" });

type CapabilityResponse = {
  model: string;
  capabilities: {
    completion: boolean;
    vision: boolean;
  };
  think: {
    supported: boolean;
    levels: ("low" | "medium" | "high")[];
  };
};

export async function POST(req: Request) {
  try {
    const { model } = (await req.json()) as { model: string };
    if (!model || typeof model !== "string") {
      return NextResponse.json({ error: "Missing 'model'" }, { status: 400 });
    }

    // First, try to read declared capabilities via `show`
    let declaredCapabilities: string[] = [];
    try {
      const show: any = await client.show({ model });
      const caps = show?.capabilities;
      if (Array.isArray(caps)) declaredCapabilities = caps.filter((c: unknown) => typeof c === "string");
    } catch {}

    const hasVision = declaredCapabilities.includes("vision");
    const hasCompletion = declaredCapabilities.includes("completion") || declaredCapabilities.length === 0;

    // Determine think support empirically with ultra-cheap probes
    // Use generate to avoid chat history overhead and keep_alive=0 to unload immediately
    const levels: ("low" | "medium" | "high")[] = [];
    const tryLevel = async (level: "low" | "medium" | "high") => {
      try {
        await client.generate({
          model,
          prompt: "hi",
          stream: false,
          think: level,
          keep_alive: 0,
          options: { num_predict: 1 } as any,
        } as any);
        return true;
      } catch (e) {
        const msg = String((e as Error)?.message || e || "");
        // Treat 400/unsupported semantics as false
        if (/unsupported|think/i.test(msg)) return false;
        // Unknown errors: assume not supported to be safe
        return false;
      }
    };

    // Quick parallel checks for levels; if any succeeds, think is supported
    const [lowOk, medOk, highOk] = await Promise.all([tryLevel("low"), tryLevel("medium"), tryLevel("high")]);
    if (lowOk) levels.push("low");
    if (medOk) levels.push("medium");
    if (highOk) levels.push("high");

    const body: CapabilityResponse = {
      model,
      capabilities: { completion: hasCompletion, vision: hasVision },
      think: { supported: levels.length > 0, levels },
    };
    return NextResponse.json(body);
  } catch (err: unknown) {
    const e = err as Error;
    const isConnRefused = /ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(String(e.message));
    const msg = isConnRefused
      ? "Cannot connect to Ollama at 127.0.0.1:11434. Start Ollama (ollama serve)."
      : `Unexpected server error: ${e.message}`;
    return NextResponse.json({ error: msg, code: isConnRefused ? "OLLAMA_UNAVAILABLE" : "SERVER_ERROR" }, { status: 500 });
  }
}


