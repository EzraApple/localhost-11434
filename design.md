## Project: Ollama Desk

### Vision

- **Goal**: A local-first desktop chat application with a modern UI that mirrors capabilities of ChatGPT/Claude-type apps, powered by Ollama models, packaged via Electron, with Next.js (T3 style) handling UI, data, streaming inference, and tool/MCP integration.
- **Non-goals**: Hosted deployment, multi-user auth, cloud infra. Prioritize local performance, type safety, and clear separation of concerns.

### Guiding principles

- **Local-first**: All core features work offline; degrade gracefully for online-dependent tools (web search, remote MCP).
- **Type-safety**: End-to-end types via TypeScript, tRPC, Zod validation at boundaries.
- **Functional style**: Prefer pure functions and modules over classes. Descriptive names (e.g., `createMcpHost`, `getAvailableModels`).
- **Separation of concerns**: Isolate modules: UI rendering, chat orchestration, streaming assembly, persistence, and tool execution.
- **Deterministic UX**: Avoid flicker and malformed markdown while streaming (buffer until blocks complete where needed).
- **DX matters**: Strict ESLint/Prettier, clear folder structure, commented configs, small composable utilities.
- **Security**: Electron `contextIsolation: true`, minimal IPC surface, validate inputs.

### Phase progress checklist

- Phase 1: Scaffolding & DX — Implemented [x]  Verified [x]
  - [x] Monorepo workspace configured (workspaces, scripts)
  - [x] T3 app scaffolded in `next-app/` (create-t3-app)
  - [x] Electron main + preload minimal shell
  - [x] Basic layout scaffold (sidebar + content)
  - [x] Dev scripts wire Next → Electron
  - [x] ESLint/Prettier/TS strict configs (from T3; Electron TS config added)
  - Verify
    - [x] `pnpm dev` opens Electron with Next UI
    - [x] Hot reload works
    - [x] Type-check and lint pass

- Phase 2: Database & history — Implemented [ ]  Verified [ ]
  - [ ] Prisma schema + migrations (SQLite in app data path)
  - [ ] `history` router CRUD
  - [ ] Auto-title util
  - [ ] Sidebar buckets (today/yesterday/7/30/older) + search
  - Verify
    - [ ] Create chat/messages, correct buckets
    - [ ] Persistence across restarts

- Phase 3: Ollama + streaming chat — Implemented [ ]  Verified [ ]
  - [ ] `ollama-client` (list/show/streamChat)
  - [ ] `stream-assembler` (balanced markdown)
  - [ ] `reasoning-extractor` + `reasoning-panel`
  - [ ] Tokens/sec estimator + final metrics merge
  - [ ] Edit/resend, retry with different model, copy blocks
  - Verify
    - [ ] Smooth streaming without broken fences
    - [ ] Tokens/sec visible; final stats align
    - [ ] Model switch persists correctly

- Phase 4: Model capabilities & notes — Implemented [ ]  Verified [ ]
  - [ ] Capabilities via `ollama.show`
  - [ ] Model list (pulled/available) + notes
  - Verify
    - [ ] Notes persist; capabilities accurate

- Phase 5: Network awareness & UX — Implemented [ ]  Verified [ ]
  - [ ] Online/offline detection + probe
  - [ ] Sidebar indicator; disable web-only tools offline
  - [ ] Theming polish (gradients, translucency/vibrancy)
  - Verify
    - [ ] Toggle network updates UI; no errors

- Phase 6: Tools & MCP host — Implemented [ ]  Verified [ ]
  - [ ] Tool router with simple web search
  - [ ] MCP host (config, spawn/connect, toggle tools)
  - [ ] Tools reflected in system prompt and callable
  - Verify
    - [ ] Tool calls execute; results rendered
    - [ ] MCP servers editable; tools appear/work

- Phase 7: Benchmarks — Implemented [ ]  Verified [ ]
  - [ ] Benchmark prompts CRUD
  - [ ] Run across models; store outputs & metrics
  - [ ] Compare view
  - Verify
    - [ ] Results persist; performance consistent

- Phase 8: Packaging — Implemented [ ]  Verified [ ]
  - [ ] Next standalone + electron-builder packaging
  - [ ] DB path correct; icons/splash
  - Verify
    - [ ] DMG install; app starts offline; streaming works

- Phase 9 (optional): RAG — Implemented [ ]  Verified [ ]
  - [ ] Embeddings (`ollama.embed`) + local vector store
  - [ ] Ingestion UI; retrieval tool
  - Verify
    - [ ] Grounded answers cite sources

### Core features (first iteration)

- **Modern UI**: Tailwind + shadcn/ui; tasteful gradients, translucency (macOS vibrancy where available).
- **Network awareness**: Detect online/offline; show sidebar indicator; disable online-only tools when offline.
- **Ollama integration**:
  - List pulled models and their capabilities (vision, function-calling support, context length, etc.).
  - Chat with streaming and tokens/sec. Compute live approximate throughput; finalize with accurate metrics from Ollama response when available.
  - Block rendering of markdown segments until fences complete (no orphaned code blocks).
- **Chat experience**:
  - Rich markdown + code highlighting, image display (if model supports VLM), tool call/result rendering.
  - Copy-to-clipboard, edit/resend any message, retry last with different model, per-message model override.
- **History**:
  - Auto-titled chats; sidebar lists by time buckets: Today, Yesterday, Last 7 days, Last 30 days, Older.
  - Search titles and tag-based quick filters (tags inferred from content and user-managed).
- **Web search tool**: Optional internet grounding tool (via MCP or custom tool) when online.
- **Benchmark prompts**: Save named prompts, run against selected models, record results and metrics.
- **Model notes**: Notes per model, visible even if not currently pulled.
- **MCP host**: Host and configure MCP clients (local commands or remote URLs) similar to Cursor’s `mcp.json`. Toggle tools per workspace and merge into system prompt and tool router.


## Architecture

### High-level

- **Electron**: Shell for native windowing; loads Next app via local HTTP. Uses `preload` to expose a tiny, typed API for OS integrations (network status, app metadata, window controls).
- **Next.js (App Router)**: Renders UI, owns tRPC server, Prisma ORM, and Ollama client integration. Route Handlers for streaming. Scaffolded via T3 using `create-t3-app`.
- **Database**: Prisma + SQLite stored in app data dir. Optional additional RAG DB later (e.g., SQLite with `sqlite-vec` or a local vector store).
- **IPC**: Electron `ipcMain`/`ipcRenderer` bridged via `contextBridge`. No direct Node APIs in renderer.
- **tRPC**: End-to-end typed API between React client and Next server.
- **Ollama client**: `ollama` npm library (Node runtime). Streaming via AsyncGenerator -> Web ReadableStream to the browser.
- **Tooling/MCP**: Tool router inside Next server. MCP clients managed by a host process (Node) launched by Next or Electron main with configuration UI.

### Process model

- Dev: `next dev` on `http://localhost:3000`; Electron launches a `BrowserWindow` pointed to that URL.
- Prod: Build Next standalone; start a local Node server (`next start` or custom minimal server around the standalone output). Electron launches and loads the local URL. Use electron-builder for packaging.

### Streaming strategy

- Use `ollama.chat({ stream: true })` (AsyncGenerator).
- Convert generator to a `ReadableStream` in a Next Route Handler; stream chunks to the renderer.
- Implement a `StreamAssembler` on the client to prevent unbalanced markdown:
  - Buffer within fenced code blocks until closing fence arrives, then flush.
  - Outside code blocks, stream normally.
  - Maintain incremental token/char counters and timestamps to estimate tokens/sec; finalize with model metrics when available.
- Reasoning/thinking display:
  - If model supports `think` (Ollama param) or emits `<think>`/`<thinking>` sections, capture these tokens separately.
  - Render a pulsing dropdown panel with a brain icon labeled “Planning next moves” while thinking is streaming; after completion, show “Thought for xx seconds” and collapse by default.
  - Do not mix thinking text into the final assistant message content by default; keep it inspectable via the dropdown.

### Markdown & code rendering

- `react-markdown` with rehype plugins, or Shiki (SSR) for stable highlighting.
- Copy buttons per code block; model/tool badges inline.

### Network detection

- Renderer uses `navigator.onLine`, `online/offline` events.
- Background reachability probe to a 204 endpoint (configurable) with timeout/backoff. Electron main may also monitor network via `net` if needed and push status via preload API.

### Security

- Electron: `contextIsolation: true`, `sandbox: true` where possible; expose only whitelisted APIs.
- Validate all IPC and tRPC inputs with Zod. Avoid `eval`/dangerous HTML; sanitize markdown.


## File structure (monorepo)

```
ollama-desk/
  package.json                 # root workspace + orchestration scripts
  pnpm-workspace.yaml          # or npm workspaces; pick one (pnpm recommended)
  turbo.json                   # optional: task pipeline if we adopt Turborepo later
  .editorconfig
  .gitignore
  .prettierignore
  .prettierrc.cjs              # formatting config
  eslint.config.js             # flat config; strict TS rules
  tsconfig.base.json           # shared TS settings
  design.md                    # this document
  LICENSE
  .vscode/
    launch.json                # debug Electron + Next
    settings.json

  electron/                    # Electron main & preload
    package.json
    tsconfig.json
    electron-builder.yml       # packaging config (appId, mac target, files)
    src/
      main.ts                  # app lifecycle, create window, load Next URL
      preload.ts               # contextBridge exposing minimal APIs
      api/
        app-info.ts            # getAppVersion, platform info
        network.ts             # online status events, reachability checks (bridged)
        window-controls.ts     # minimize/close, vibrancy toggles
      util/
        logger.ts              # main-process logging
        paths.ts               # resolve app data dir, DB path

  next-app/                    # Next.js app (App Router)
    package.json
    next.config.ts             # Node runtime; headers for streaming if needed
    postcss.config.cjs
    tailwind.config.ts
    tsconfig.json
    prisma/
      schema.prisma            # SQLite models
      migrations/              # generated by Prisma
    src/
      app/
        layout.tsx             # root layout; theming, fonts
        page.tsx               # default landing (new chat)
        api/
          ollama/route.ts      # streaming route handler wrapper if needed
        (chat)/
          page.tsx             # chat screen (SSR+Client components)
      components/
        chat/
          chat-input.tsx       # prompt bar, attachments, model picker
          chat-stream.tsx      # streaming renderer with StreamAssembler
          message.tsx          # message bubble (markdown, code, tools)
          reasoning-panel.tsx  # pulsing dropdown with brain icon; shows thinking
          tool-call.tsx        # render tool invocations/results
        sidebar/
          history-list.tsx     # grouped history view
          new-chat-button.tsx
          network-indicator.tsx
        ui/                    # shadcn components (kebab-case files)
      styles/
        globals.css
      lib/
        ollama-client.ts       # `ollama` instance, helper wrappers (supports think)
        stream-assembler.ts     # buffering logic for fenced blocks
        reasoning-extractor.ts  # parse <think>/<thinking> sections when present
        tokens-per-sec.ts       # throughput estimation utilities
        time-buckets.ts         # today/yesterday/7/30/older helpers
        title-from-messages.ts  # auto-title
        markdown.ts             # renderer config/sanitization
        network.ts              # client-side online detection & probe
        tool-router.ts          # function-calling dispatch
        mcp/
          host.ts              # createMcpHost (spawns/connects clients)
          clients/
            http-client.ts     # connect to remote MCP servers
            command-client.ts  # local command servers
          config.ts            # parse/edit persisted config
      server/                  # T3-aligned locations
        api/
          root.ts             # root router (t3)
          trpc.ts             # t3 trpc helper
          routers/
            chat.ts           # startChat, sendMessage, retryWithModel
            models.ts         # getAvailableModels, getModelDetails
            history.ts        # CRUD for chats, messages, tags
            benchmarks.ts     # CRUD & run benchmark prompts
            mcp.ts            # list tools, toggle, run tool manually
        db/
          index.ts            # Prisma client init (singleton)
        services/
          chat-orchestrator.ts # orchestrate model calls + tools (normalizes per-model formats)
          message-store.ts     # persistence boundary
          model-capabilities.ts# derive capabilities from `ollama show`
      pages/                    # (optional) only if we need legacy routes
      env.mjs                   # typed env loader (dotenv) (T3 style)

  packages/                    # optional shared packages (ui, config)
    ui/                        # if we extract design system pieces
      package.json
      tsconfig.json
      src/
        index.ts
```

Notes:
- All file names use kebab-case, per preference.
- We can skip Turborepo initially; workspaces + `concurrently` are sufficient.


## Data model (Prisma; draft)

```prisma
model Chat {
  id           String    @id @default(cuid())
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  title        String
  systemPrompt String?
  messages     Message[]
  tags         TagOnChat[]
}

model Message {
  id          String    @id @default(cuid())
  chatId      String
  role        String    // 'user' | 'assistant' | 'system' | 'tool'
  content     String    // markdown; tool results stored as markdown blocks
  model       String?   // model used to produce assistant message
  toolCalls   ToolCall[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  Chat        Chat      @relation(fields: [chatId], references: [id])
}

model ToolCall {
  id         String   @id @default(cuid())
  messageId  String
  name       String
  arguments  Json
  result     Json?
  Message    Message  @relation(fields: [messageId], references: [id])
}

model ModelNote {
  id        String   @id @default(cuid())
  modelName String   @unique
  notes     String   // markdown
  lastUsed  DateTime?
}

model BenchmarkPrompt {
  id        String   @id @default(cuid())
  name      String   @unique
  prompt    String
  createdAt DateTime @default(now())
}

model BenchmarkRun {
  id          String   @id @default(cuid())
  promptId    String
  modelName   String
  response    String
  tokens      Int?
  durationMs  Int?
  createdAt   DateTime @default(now())
  BenchmarkPrompt BenchmarkPrompt @relation(fields: [promptId], references: [id])
}

model Tag {
  id    String @id @default(cuid())
  name  String @unique
  chats TagOnChat[]
}

model TagOnChat {
  chatId String
  tagId  String
  Chat   Chat   @relation(fields: [chatId], references: [id])
  Tag    Tag    @relation(fields: [tagId], references: [id])
  @@id([chatId, tagId])
}
```


## Key modules (behavioral design)

- **`ollama-client.ts`**
  - Wraps `import ollama from 'ollama'` and/or `new Ollama({ host })`.
  - Methods: `getAvailableModels()`, `getModelDetails(model)`, `streamChat(request)` returning AsyncIterable parts.
  - Honors `keep_alive`, `tools`, `options`.

- **`stream-assembler.ts`**
  - State machine: outside/inside fenced block; buffer until closing fence; yields chunks safe-to-render. Minimizes flicker and prevents malformed markdown.

- **`chat-orchestrator.ts`**
  - Accepts messages array and model config; performs tool loop:
    1) Ask model with `tools` defined.
    2) If tool calls returned, dispatch to `tool-router`.
    3) Append tool results as messages; continue until final assistant content.
  - Streams assistant content via Node streams to the client.

- **`tool-router.ts`**
  - Registry of tool implementations (web search, filesystem snippets, etc.). Each tool: `name`, `schema` (Zod), `execute`.

- **`mcp/host.ts`**
  - Loads MCP config (similar to `mcp.json`), spawns/attaches to servers, advertises tools to `tool-router`.
  - Toggles enable/disable per tool; serializes to DB/config file.

- **`tokens-per-sec.ts`**
  - Computes rolling throughput estimates from streamed text length and wall-clock deltas; reconciles with final `eval_count`/`eval_duration` when provided by Ollama.


## External APIs and rationale

- **Ollama JS** (`ollama`):
  - `ollama.chat({ model, messages, stream: true, tools, keep_alive, options })` returns AsyncGenerator of parts.
  - Model management: `ollama.list()`, `ollama.show({ model })`.
  - Vision: include images via `images` in `generate`/`chat` when models support VLM.
  - Function calling: pass `tools` and handle returned tool calls.
  - Reasoning: when models support `think: true`, Ollama handles the reasoning phase and streams tokens as part of the normal content stream; some models may wrap with `<think>` tags. We will parse thinking content opportunistically but keep the core flow unified via Ollama’s API without bespoke per-model branching unless needed.

- **Next.js (App Router)**:
  - Use Route Handlers to bridge AsyncGenerator -> `ReadableStream` for streaming to the client.
  - Node runtime for access to `ollama` Node APIs.

- **Electron**:
  - `contextBridge.exposeInMainWorld` minimal APIs: `getNetworkStatus`, `getAppInfo`, `setVibrancy`, `openExternal`.
  - Keep main process small; avoid long-running work there.


## Configs (sketched)

```jsonc
// package.json (root) — workspace and orchestration
{
  "name": "ollama-desk",
  "private": true,
  "workspaces": ["electron", "next-app", "packages/*"],
  "scripts": {
    "dev": "concurrently -n NEXT,ELEC -c blue,magenta \"pnpm -C next-app dev\" \"wait-on tcp:3000 && pnpm -C electron dev\"",
    "build": "pnpm -C next-app build && pnpm -C electron build",
    "start": "concurrently -n NEXT,ELEC -c blue,magenta \"pnpm -C next-app start\" \"wait-on tcp:3000 && pnpm -C electron start\"",
    "lint": "pnpm -C next-app lint && pnpm -C electron lint"
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "wait-on": "^8.0.0"
  }
}
```

```ts
// next-app/next.config.ts — Node runtime, streaming-friendly headers
import type { NextConfig } from 'next'
const config: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  headers: async () => [
    { source: '/:path*', headers: [ { key: 'X-Accel-Buffering', value: 'no' } ] }
  ],
}
export default config
```

```yaml
# electron/electron-builder.yml — minimal mac setup
appId: com.yourname.ollamadesk
mac:
  category: public.app-category.developer-tools
  target:
    - dmg
files:
  - dist/**
  - '!**/node_modules/.cache/**'
```

```ts
// electron/src/main.ts — loads Next URL
// Create a BrowserWindow, point to http://localhost:3000 (dev) or packed server URL (prod)
```


## Coding conventions

- **Naming**: kebab-case files; PascalCase components; functions are descriptive verbs; variables are nouns.
- **Types**: Explicit exported types; avoid `any`; Zod schemas for all external boundaries (IPC/tRPC/Route Handlers).
- **Control flow**: Guard clauses; error-first handling; shallow nesting.
- **Comments**: Explain “why” not “how”; avoid stale comments; keep configs and file tree annotated.
- **Formatting**: Prettier-managed; no unrelated reformatting in edits.


## Phase plan

### Phase 1: Scaffolding & DX

- Monorepo workspace; Next (App Router, TS, Tailwind, shadcn), Prisma (SQLite), tRPC, ESLint/Prettier.
- Scaffold Next app via T3: `pnpm dlx create-t3-app@latest next-app --CI --noGit --trpc --prisma --tailwind --nextAuth=false --appRouter --eslint --srcDir --importAlias @/*` (adjust flags as needed; we’ll remove NextAuth and align folders to design).
- Electron main+preload minimal shell; dev script starts Next then Electron.
- Basic layout with sidebar + content scaffold.
- Verify:
  - `pnpm dev` opens Electron window with Next UI.
  - Hot reload works; type-checking passes; lint passes.

### Phase 2: Database & history foundation

- Prisma schema and migrations; DB path resolved to app data dir.
- Implement `history.ts` tRPC router; message persistence; auto-title util.
- Sidebar: buckets (today/yesterday/7/30/older), search by title.
- Verify:
  - Create chat, add messages, see in correct buckets.
  - Restart app; data persists.

### Phase 3: Ollama integration + streaming chat

- `ollama-client.ts` with model listing and `streamChat`.
- `stream-assembler.ts` to handle fenced blocks; `chat-stream.tsx` renderer.
- Tokens/sec estimator; final metrics merge.
- Per-message model selection; retry/edit-resend; copy code blocks.
- Verify:
  - Live streaming without broken markdown.
  - Tokens/sec shown; final stats align with Ollama outputs.
  - Switch models mid-thread; persisted correctly.

### Phase 4: Model capabilities & notes

- `model-capabilities.ts` via `ollama.show`.
- Model list view: pulled/available; notes per model.
- Verify:
  - Notes save and display; capabilities reflect reality (vision/tools/context length).

### Phase 5: Network awareness & UX polish

- Online/offline detection; reachability probe; sidebar indicator; disable web-only tools.
- Theming: gradients, translucency; mac vibrancy toggle.
- Verify:
  - Toggle network: indicator updates; tools disabled; no errors.

### Phase 6: Tools & MCP host

- Tool router with at least one tool: simple web search (HTTP fetch) gated by online status.
- MCP host: load config, spawn/connect clients (remote or command). Toggle tools on/off; surface in system prompt.
- Verify:
  - Model calls tool(s) via function calling; tool results rendered.
  - MCP servers can be added/edited; tools appear and work.

### Phase 7: Benchmarks

- CRUD for benchmark prompts; run across selected models; record outputs and metrics.
- Simple compare view.
- Verify:
  - Run benchmark suite; results persist; performance numbers consistent.

### Phase 8: Packaging

- Next standalone build + Electron packaging via electron-builder.
- App loads packed Next server; DB path correct; icons/splash.
- Verify:
  - Installable DMG; app starts offline; streaming chat works; no dev deps required.

### Phase 9 (optional): RAG

- Add embeddings with Ollama `embed`; simple local vector index (consider `sqlite-vec` or `lancedb`).
- Ingestion UI for folders/files; retrieval tool the model can call.
- Verify:
  - Search returns relevant chunks; grounded answers cite sources.


## Verification checklist per phase

- Scripts: `dev`, `build`, `start` function on macOS.
- Type checks: `tsc --noEmit` clean for electron and next-app.
- Lint: zero errors; warnings only when intentional.
- Manual E2E:
  - Start a chat, stream long code answer -> no broken fences.
  - Switch model mid-session; tokens/sec visible.
  - Go offline -> web search disabled; no crashes.
  - Packaged app launches without dev servers.


## Risks & mitigations

- Streaming markdown correctness: use `StreamAssembler` with tests for fence edge cases.
- Electron security: keep preload surface tiny; never expose raw `ipcRenderer`.
- Next + Electron startup order: orchestrate with `wait-on`; retry/backoff.
- Tokens/sec accuracy: display “approx” during stream; reconcile on completion.
- MCP complexity: ship minimal tool router first; add MCP after stable core.
- Model-specific formats: rely on Ollama’s unified API; if certain models emit `<think>`/custom wrappers, handle via `reasoning-extractor` without fragmenting the orchestrator.


## References

- Ollama JS: chat streaming, tools, model ops.
- Next.js App Router: Route Handlers, streaming with `ReadableStream`.
- Electron: `contextBridge`, `ipcMain/ipcRenderer`, security best practices.

