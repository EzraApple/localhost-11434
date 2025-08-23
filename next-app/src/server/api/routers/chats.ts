import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const chatsRouter = createTRPCRouter({
  list: publicProcedure.input(z.void()).query(async ({ ctx }) => {
    const chats = await ctx.db.chat.findMany({
      select: { id: true, title: true, model: true, lastSetModel: true, lastSetPrompt: true, createdAt: true, lastMessageAt: true, pinned: true, pinnedAt: true },
      orderBy: [
        { pinned: "desc" },
        { pinnedAt: "desc" },
        { lastMessageAt: "desc" },
        { createdAt: "desc" },
      ],
    });
    return { chats };
  }),

  create: publicProcedure.input(
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(200).optional(),
      model: z.string().min(1).max(200).optional(),
    })
  ).mutation(async ({ ctx, input }) => {
    const id = input.id ?? crypto.randomUUID();
    const chat = await ctx.db.chat.upsert({
      where: { id },
      update: {
        title: input.title ?? "New Chat",
        model: input.model,
      },
      create: {
        id,
        title: input.title ?? "New Chat",
        model: input.model,
      },
      select: { id: true, title: true, model: true, lastSetModel: true, lastSetPrompt: true, createdAt: true, lastMessageAt: true, pinned: true, pinnedAt: true },
    });
    return { chat };
  }),

  rename: publicProcedure.input(
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(200) })
  ).mutation(async ({ ctx, input }) => {
    const chat = await ctx.db.chat.update({
      where: { id: input.id },
      data: { title: input.title },
      select: { id: true, title: true, model: true, lastSetModel: true, lastSetPrompt: true, createdAt: true, lastMessageAt: true, pinned: true, pinnedAt: true },
    });
    return { chat };
  }),

  delete: publicProcedure.input(
    z.object({ id: z.string().uuid() })
  ).mutation(async ({ ctx, input }) => {
    await ctx.db.chat.delete({ where: { id: input.id } });
    return { ok: true } as const;
  }),

  pin: publicProcedure.input(
    z.object({ id: z.string().uuid(), pinned: z.boolean() })
  ).mutation(async ({ ctx, input }) => {
    const chat = await ctx.db.chat.update({
      where: { id: input.id },
      data: { pinned: input.pinned, pinnedAt: input.pinned ? new Date() : null },
      select: { id: true, title: true, model: true, lastSetModel: true, lastSetPrompt: true, createdAt: true, lastMessageAt: true, pinned: true, pinnedAt: true },
    });
    return { chat };
  }),

  setModel: publicProcedure.input(
    z.object({ id: z.string().uuid(), model: z.string().min(1).max(200) })
  ).mutation(async ({ ctx, input }) => {
    // Use upsert to handle cases where chat doesn't exist yet
    const chat = await ctx.db.chat.upsert({
      where: { id: input.id },
      update: { lastSetModel: input.model },
      create: { 
        id: input.id, 
        title: "New Chat", 
        lastSetModel: input.model 
      },
      select: { id: true, title: true, model: true, lastSetModel: true, lastSetPrompt: true, createdAt: true, lastMessageAt: true, pinned: true, pinnedAt: true },
    });
    return { chat };
  }),

  setPrompt: publicProcedure.input(
    z.object({ id: z.string().uuid(), promptId: z.string().min(1).max(200) })
  ).mutation(async ({ ctx, input }) => {
    // Use upsert to handle cases where chat doesn't exist yet
    const chat = await ctx.db.chat.upsert({
      where: { id: input.id },
      update: { lastSetPrompt: input.promptId },
      create: { 
        id: input.id, 
        title: "New Chat", 
        lastSetPrompt: input.promptId 
      },
      select: { id: true, title: true, model: true, lastSetModel: true, lastSetPrompt: true, createdAt: true, lastMessageAt: true, pinned: true, pinnedAt: true },
    });
    return { chat };
  }),

  preloadImportantChats: publicProcedure.input(z.void()).query(async ({ ctx }) => {
    // Get pinned chats
    const pinnedChats = await ctx.db.chat.findMany({
      where: { pinned: true },
      select: { id: true },
      orderBy: [
        { pinnedAt: "desc" },
        { lastMessageAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    // Get top 3 most recent non-pinned chats with messages
    const recentChats = await ctx.db.chat.findMany({
      where: { 
        pinned: false,
        lastMessageAt: { not: null }
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 5,
      select: { id: true },
    });

    const importantChatIds = [
      ...pinnedChats.map(c => c.id),
      ...recentChats.map(c => c.id)
    ];

    // If no important chats found, return empty result
    if (importantChatIds.length === 0) {
      return {
        preloadedChats: {},
        totalChats: 0,
        cachedAt: new Date().toISOString()
      };
    }

    // Batch fetch messages for all important chats (limit to last 100 messages per chat for performance)
    const preloadedData = await Promise.all(
      importantChatIds.map(async (chatId) => {
        const messages = await ctx.db.message.findMany({
          where: { chatId },
          orderBy: [{ createdAt: "asc" }, { index: "asc" }],
          select: { id: true, chatId: true, role: true, parts: true, createdAt: true, index: true },
          take: 100, // Limit to prevent excessive memory usage
        });
        return { chatId, messages };
      })
    );

    return {
      preloadedChats: Object.fromEntries(
        preloadedData.map(({ chatId, messages }) => [
          chatId,
          {
            messages,
            messageCount: messages.length,
            cachedAt: new Date().toISOString()
          }
        ])
      ),
      totalChats: importantChatIds.length,
      cachedAt: new Date().toISOString()
    };
  }),
});


