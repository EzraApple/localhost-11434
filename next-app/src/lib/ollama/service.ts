import { Ollama } from 'ollama'
// Ensure this module is server-only
import 'server-only'

const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const client = new Ollama({ host: OLLAMA_BASE_URL })

export type OllamaModel = {
  name: string;
  size?: number;
  modifiedAt?: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
};

async function ping(): Promise<boolean> {
  try {
    const res = await client.list()
    return Array.isArray((res as any)?.models) || !!(res as any)?.models
  } catch {
    return false
  }
}

async function listAvailableModels(): Promise<OllamaModel[]> {
  const data = await client.list() as any
  const models = data?.models ?? []
  return models.map((m: any) => ({
    name: m.name,
    size: m.size,
    modifiedAt: m.modified_at,
    family: m.details?.family,
    parameterSize: m.details?.parameter_size,
    quantization: m.details?.quantization_level,
  }))
}

export const ollamaService = {
  ping,
  listAvailableModels,
  // For initial UI work: return a deterministic set of chunks to simulate streaming
  dummyMessageChunks(): { kind: 'reasoning' | 'text'; text: string; delayMs: number }[] {
    const thinking = `I'm going to outline a small React TODO list. I'll use useState for simplicity, a form to add items, and basic list rendering. Then I'll summarize key points.`;
    const answer = `# Simple React TODO List\n\n\`\`\`tsx\nimport { useState } from 'react'\n\nexport default function TodoList() {\n  const [items, setItems] = useState<string[]>([])\n  const [text, setText] = useState('')\n\n  return (\n    <div className=\"max-w-md space-y-3\">\n      <form\n        onSubmit={e => {\n          e.preventDefault()\n          if (!text.trim()) return\n          setItems(prev => [text.trim(), ...prev])\n          setText('')\n        }}\n        className=\"flex gap-2\"\n      >\n        <input\n          className=\"flex-1 rounded border px-2 py-1\"\n          value={text}\n          onChange={e => setText(e.target.value)}\n          placeholder=\"Add a todo...\"\n        />\n        <button className=\"rounded bg-black px-3 py-1 text-white\" type=\"submit\">Add</button>\n      </form>\n\n      <ul className=\"space-y-1\">\n        {items.map((item, idx) => (\n          <li key={idx} className=\"rounded border px-2 py-1\">{item}</li>\n        ))}\n      </ul>\n    </div>\n  )\n}\n\n\`\`\`\n\n- Uses useState for items and input\n- Handles submit to prepend a new todo\n- Renders a simple list with basic styling`;

    const toChars = (s: string) => s.split("");
    const rnd = () => Math.floor(Math.random() * 3) + 10; // 1-3ms
    const thinkingChunks = toChars(thinking).map((c) => ({ kind: 'reasoning' as const, text: c, delayMs: rnd() }));
    const textChunks = toChars(answer).map((c) => ({ kind: 'text' as const, text: c, delayMs: rnd() }));
    return [...thinkingChunks, ...textChunks];
  },
  async generateChatName(input: { model: string; firstMessage: string; maxLen?: number }): Promise<string> {
    const prompt = `Generate a concise, single-line chat title (max 60 chars) for this first user message. No quotes, no punctuation at the end.\n\nMessage:\n"""${input.firstMessage}"""`;
    const res = await client.chat({
      model: input.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }) as any
    let title = String(res?.message?.content ?? '').trim()
    const limit = input.maxLen ?? 60
    if (title.length > limit) title = title.slice(0, limit - 1) + '…'
    return title || 'New Chat'
  },
};

export type OllamaService = typeof ollamaService;


