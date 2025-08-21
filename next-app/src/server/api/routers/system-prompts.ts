import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const systemPromptsRouter = createTRPCRouter({
  list: publicProcedure.input(z.void()).query(async ({ ctx }) => {
    const prompts = await ctx.db.systemPrompt.findMany({
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
    });
    return { prompts };
  }),

  create: publicProcedure.input(
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(200),
      content: z.string().min(1),
    })
  ).mutation(async ({ ctx, input }) => {
    const id = input.id ?? crypto.randomUUID();
    const prompt = await ctx.db.systemPrompt.create({
      data: { id, title: input.title, content: input.content },
      select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
    });
    return { prompt };
  }),

  update: publicProcedure.input(
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(200),
      content: z.string().min(1),
    })
  ).mutation(async ({ ctx, input }) => {
    const prompt = await ctx.db.systemPrompt.update({
      where: { id: input.id },
      data: { title: input.title, content: input.content },
      select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
    });
    return { prompt };
  }),

  delete: publicProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.systemPrompt.delete({ where: { id: input.id } });
    return { ok: true } as const;
  }),
});


