# Ollama Desk

A T3 Chat-inspired chat application for your local Ollama models. Ollama Desk provides a clean, modern interface for interacting with AI models that run entirely on your laptop, with a focus on real functionality and beautiful design.

## What is Ollama Desk?

Ollama Desk is a desktop chat application built with the T3 Stack that connects to your local Ollama instance. It's designed for users who want to chat with AI models while maintaining privacy and control over their data - everything runs locally on your machine.

### Current Features

- **Local AI Chat**: Connect to any Ollama model running on your system
- **Model Management**: Pull, list, and manage your local Ollama models
- **Custom System Prompts**: Define and apply custom system prompts to test model behavior
- **Persistent Chat History**: All conversations are stored locally in SQLite
- **Clean UI**: Modern, responsive interface built with Radix UI and Tailwind CSS
- **Desktop App**: Available as both a web app and Electron desktop application

### Future Features

- **Tool Calling**: Execute functions and tools through AI models
- **MCP Client**: Model Context Protocol client to expose and manage tools
- **Knowledge Base**: Upload documents and files for intelligent context retrieval
- **Advanced Model Testing**: Comprehensive testing and evaluation tools

## Prerequisites

Before running Ollama Desk, you'll need:

- **Node.js 18+** and **pnpm** (recommended) or npm
- **Ollama** installed and running locally
- **SQLite** (included with the app)

## Quick Start

### 1. Install Ollama

First, install Ollama on your system:

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from https://ollama.ai/download
```

### 2. Start Ollama

Start the Ollama service:

```bash
ollama serve
```

This will start Ollama on `http://127.0.0.1:11434` (the default port).

### 3. Pull a Model

Pull a model to test with:

```bash
ollama pull llama3.2:3b
```

### 4. Clone and Setup

```bash
git clone git@github.com:EzraApple/ollama-chat.git
cd ollama-desk
pnpm install
```

### 5. Environment Setup

Create a `.env.local` file in the `next-app` directory:

```bash
cd next-app
echo "DATABASE_URL=file:./dev.db" > .env.local
```

### 6. Database Setup

Initialize the database:

```bash
pnpm db:push
```

### 7. Run the Application

From the root directory:

```bash
# Run both Next.js app and Electron desktop app
pnpm dev

# Or run just the web app
pnpm -C next-app dev
```

The web app will be available at `http://localhost:3000`, and the Electron app will launch automatically once the web app is ready.

## Project Structure

```
ollama-desk/
├── electron/          # Desktop application
├── next-app/          # Web application
│   ├── src/
│   │   ├── app/       # Next.js app router
│   │   ├── components/ # UI components
│   │   ├── lib/       # Utilities and stores
│   │   └── server/    # tRPC API routes
│   └── prisma/        # Database schema
└── package.json       # Workspace configuration
```

## Development

### Available Scripts

- `pnpm dev` - Start both web and desktop apps
- `pnpm build` - Build both applications
- `pnpm lint` - Type check the codebase
- `pnpm db:studio` - Open Prisma Studio for database management
- `pnpm db:push` - Push database schema changes

### Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **UI**: Radix UI, Tailwind CSS, shadcn/ui
- **Backend**: tRPC, Prisma, SQLite
- **AI Integration**: Ollama client, AI SDK
- **Desktop**: Electron
- **Package Manager**: pnpm workspaces

## Troubleshooting

### Ollama Connection Issues

If you see "Cannot connect to Ollama" errors:

1. Ensure Ollama is running: `ollama serve`
2. Check if Ollama is accessible at `http://127.0.0.1:11434`
3. Verify your firewall isn't blocking the connection

### Database Issues

If you encounter database errors:

1. Run `pnpm db:push` to sync the schema
2. Check that your `.env.local` file has the correct `DATABASE_URL`
3. Use `pnpm db:studio` to inspect the database

### Build Issues

For build problems:

1. Clear node_modules: `rm -rf node_modules && pnpm install`
2. Ensure you're using the correct Node.js version
3. Check that all dependencies are properly installed

## Contributing

This project is built with the T3 Stack and follows its conventions. When contributing:

1. Follow the existing code style and patterns
2. Use TypeScript for all new code
3. Test your changes locally before submitting
4. Ensure the database schema is updated if needed

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

Built with the [T3 Stack](https://create.t3.gg/) - a full-stack, type-safe, web development framework.
