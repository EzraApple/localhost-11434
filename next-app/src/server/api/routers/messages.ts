import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const messagePartSchema = z.object({
  type: z.enum(["reasoning", "text"]),
  text: z.string(),
});

export const messagesRouter = createTRPCRouter({
  list: publicProcedure.input(z.object({ chatId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const messages = await ctx.db.message.findMany({
      where: { chatId: input.chatId },
      orderBy: [{ createdAt: "asc" }, { index: "asc" }],
      select: { id: true, chatId: true, role: true, parts: true, createdAt: true, index: true },
    });
    return { messages };
  }),

  create: publicProcedure.input(z.object({
    id: z.string().uuid().optional(),
    chatId: z.string().uuid(),
    role: z.enum(["USER", "ASSISTANT", "SYSTEM", "TOOL"]),
    parts: z.array(messagePartSchema),
    index: z.number().int().optional(),
  })).mutation(async ({ ctx, input }) => {
    const id = input.id ?? crypto.randomUUID();
    // Ensure the chat exists to avoid FK violations in race conditions
    await ctx.db.chat.upsert({
      where: { id: input.chatId },
      update: {},
      create: { id: input.chatId, title: "New Chat" },
    });
    const message = await ctx.db.message.create({
      data: {
        id,
        chatId: input.chatId,
        role: input.role,
        parts: input.parts as unknown as object,
        index: input.index,
      },
      select: { id: true, chatId: true, role: true, parts: true, createdAt: true, index: true },
    });
    // update chat activity timestamp
    await ctx.db.chat.update({ where: { id: input.chatId }, data: { lastMessageAt: new Date() } });
    return { message };
  }),
});


