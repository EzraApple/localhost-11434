import { NextResponse } from "next/server";

type OllamaTagModel = {
  name: string;
  size?: number;
  modified_at?: string;
  digest?: string;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
};

type OllamaTagsResponse = {
  models?: OllamaTagModel[];
};

export async function GET() {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", {
      // no special signal propagation here; Next handles request lifecycle
      // Ollama runs locally; no credentials needed
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = `Failed to list models from Ollama (HTTP ${res.status}). ${text ? `Details: ${text}` : ""}`.trim();
      return NextResponse.json({ models: [], error, code: "OLLAMA_TAGS_HTTP_ERROR" }, { status: 502 });
    }

    const data: OllamaTagsResponse = await res.json();
    const models = (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
      family: m.details?.family,
      parameterSize: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
    }));

    return NextResponse.json({ models });
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    const isConnRefused = /ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(String(e.message));
    const error = isConnRefused
      ? "Cannot connect to Ollama at 127.0.0.1:11434. Make sure Ollama is installed and running (ollama serve)."
      : `Unexpected error contacting Ollama: ${e.message}`;
    return NextResponse.json({ models: [], error, code: isConnRefused ? "OLLAMA_UNAVAILABLE" : "OLLAMA_UNKNOWN_ERROR" }, { status: 503 });
  }
}


