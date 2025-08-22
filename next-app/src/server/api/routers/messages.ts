import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const messagePartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("reasoning"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    data: z.string(),
    mimeType: z.string(),
    fileName: z.string().optional(),
  }),
]);

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

  deleteAfterMessage: publicProcedure.input(z.object({
    chatId: z.string().uuid(),
    messageId: z.string().uuid(),
  })).mutation(async ({ ctx, input }) => {
    // Get the message to find its timestamp
    const targetMessage = await ctx.db.message.findUnique({
      where: { id: input.messageId },
      select: { createdAt: true, index: true },
    });
    
    if (!targetMessage) return { deletedCount: 0 };

    // Delete the target message itself AND all messages that come after it
    const result = await ctx.db.message.deleteMany({
      where: {
        chatId: input.chatId,
        OR: [
          { id: input.messageId }, // Delete the target message itself
          { createdAt: { gt: targetMessage.createdAt } },
          { 
            createdAt: targetMessage.createdAt,
            index: { gt: targetMessage.index ?? 0 }
          }
        ]
      },
    });

    return { deletedCount: result.count };
  }),

  deleteMessage: publicProcedure.input(z.object({
    messageId: z.string().uuid(),
  })).mutation(async ({ ctx, input }) => {
    await ctx.db.message.delete({
      where: { id: input.messageId },
    });
    return { success: true };
  }),
});


