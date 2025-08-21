import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import type { StructuredSystemPrompt } from "~/app/settings/lib/system-prompts/types";
import { buildFinalPrompt } from "~/app/settings/lib/system-prompts/builder";

export const systemPromptsRouter = createTRPCRouter({
  list: publicProcedure.input(z.void()).query(async ({ ctx }) => {
    const prompts = await ctx.db.systemPrompt.findMany({
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true, title: true, content: true, sections: true, createdAt: true, updatedAt: true },
    });

    // Parse sections JSON and return structured prompts
    const structuredPrompts = prompts.map(prompt => ({
      ...prompt,
      sections: prompt.sections ? JSON.parse(prompt.sections) : null,
    }));

    return { prompts: structuredPrompts };
  }),

  create: publicProcedure.input(
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(200),
      content: z.string().min(1),
      sections: z.any().optional(), // Structured prompt data
    })
  ).mutation(async ({ ctx, input }) => {
    const id = input.id ?? crypto.randomUUID();
    const prompt = await ctx.db.systemPrompt.create({
      data: {
        id,
        title: input.title,
        content: input.content,
        sections: input.sections ? JSON.stringify(input.sections) : "",
      },
      select: { id: true, title: true, content: true, sections: true, createdAt: true, updatedAt: true },
    });

    const structuredPrompt = {
      ...prompt,
      sections: prompt.sections ? JSON.parse(prompt.sections) : null,
    };

    return { prompt: structuredPrompt };
  }),

  update: publicProcedure.input(
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(200),
      content: z.string().min(1),
      sections: z.any().optional(), // Structured prompt data
    })
  ).mutation(async ({ ctx, input }) => {
    const prompt = await ctx.db.systemPrompt.update({
      where: { id: input.id },
      data: {
        title: input.title,
        content: input.content,
        sections: input.sections ? JSON.stringify(input.sections) : "",
      },
      select: { id: true, title: true, content: true, sections: true, createdAt: true, updatedAt: true },
    });

    const structuredPrompt = {
      ...prompt,
      sections: prompt.sections ? JSON.parse(prompt.sections) : null,
    };

    return { prompt: structuredPrompt };
  }),

  delete: publicProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.systemPrompt.delete({ where: { id: input.id } });
    return { ok: true } as const;
  }),
});


