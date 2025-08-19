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
      return NextResponse.json({ models: [], error: `ollama tags failed: ${res.status}` });
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
    return NextResponse.json({ models: [], error: (err as Error).message });
  }
}


