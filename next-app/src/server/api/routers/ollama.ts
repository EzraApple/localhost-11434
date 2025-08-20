import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { ollamaService } from "~/lib/ollama/service";

// Middleware-like helper: ensure Ollama is reachable before proceeding
const ollamaProcedure = publicProcedure.use(async ({ next }) => {
  const up = await ollamaService.ping();
  if (!up) {
    throw new Error("Ollama is not running on 127.0.0.1:11434");
  }
  return next();
});

export const ollamaRouter = createTRPCRouter({
  listModels: ollamaProcedure
    .input(z.void())
    .query(async () => {
      const models = await ollamaService.listAvailableModels();
      return { models };
    }),
});


