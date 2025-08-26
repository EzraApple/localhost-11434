import { modelsRouter } from "~/server/api/routers/models";
import { chatsRouter } from "~/server/api/routers/chats";
import { messagesRouter } from "~/server/api/routers/messages";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { systemPromptsRouter } from "~/server/api/routers/system-prompts";
import { pdfRouter } from "~/server/api/routers/pdf";
import { mcpRouter } from "~/server/api/routers/mcp";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  models: modelsRouter,
  chats: chatsRouter,
  messages: messagesRouter,
  systemPrompts: systemPromptsRouter,
  pdf: pdfRouter,
  mcp: mcpRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
