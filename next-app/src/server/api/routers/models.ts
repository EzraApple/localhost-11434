import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { modelsService } from '~/lib/models/service'

const modelsProcedure = publicProcedure.use(async ({ next }) => {
  const up = await modelsService.ping()
  if (!up) {
    throw new Error('Ollama is not running on 127.0.0.1:11434')
  }
  return next()
})

export const modelsRouter = createTRPCRouter({
  list: modelsProcedure.input(z.void()).query(async () => {
    const models = await modelsService.listAvailableModels()
    return { models }
  }),

  show: modelsProcedure
    .input(z.object({ model: z.string().min(1) }))
    .query(async ({ input }) => {
      const details = await modelsService.showModel(input.model)
      return { model: input.model, details }
    }),

  capabilities: modelsProcedure
    .input(z.object({ model: z.string().min(1) }))
    .query(async ({ input }) => {
      const caps = await modelsService.getCapabilities(input.model)
      return caps
    }),

  pull: modelsProcedure
    .input(z.object({ model: z.string().min(1), insecure: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const res = await modelsService.pullModel(input.model, { insecure: input.insecure })
      return res
    }),

  remove: modelsProcedure
    .input(z.object({ model: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const res = await modelsService.deleteModel(input.model)
      return res
    }),
})


