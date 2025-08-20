import 'server-only'
import { Ollama } from 'ollama'

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
const client = new Ollama({ host: OLLAMA_BASE_URL })

export type OllamaModel = {
  name: string
  size?: number
  modifiedAt?: string
  family?: string
  parameterSize?: string
  quantization?: string
}

export type CapabilityResponse = {
  model: string
  capabilities: { completion: boolean; vision: boolean }
  think: { supported: boolean; levels: ('low' | 'medium' | 'high')[] }
}

async function ping(): Promise<boolean> {
  try {
    const res = await client.list() as any
    return Array.isArray(res?.models)
  } catch {
    return false
  }
}

async function listAvailableModels(): Promise<OllamaModel[]> {
  const data = await client.list() as any
  const models = data?.models ?? []
  return models.map((m: any) => ({
    name: m.name,
    size: m.size,
    modifiedAt: m.modified_at,
    family: m.details?.family,
    parameterSize: m.details?.parameter_size,
    quantization: m.details?.quantization_level,
  }))
}

async function showModel(model: string): Promise<any> {
  return client.show({ model }) as any
}

async function pullModel(model: string, opts?: { insecure?: boolean }): Promise<{ ok: true }>{
  // Non-streaming pull: await completion
  await client.pull({ model, insecure: !!opts?.insecure, stream: false } as any)
  return { ok: true }
}

async function deleteModel(model: string): Promise<{ ok: true }>{
  await client.delete({ model } as any)
  return { ok: true }
}

async function getCapabilities(model: string): Promise<CapabilityResponse> {
  let declaredCapabilities: string[] = []
  try {
    const show: any = await client.show({ model })
    const caps = show?.capabilities
    if (Array.isArray(caps)) declaredCapabilities = caps.filter((c: unknown) => typeof c === 'string')
  } catch {}

  const hasVision = declaredCapabilities.includes('vision')
  const hasCompletion = declaredCapabilities.includes('completion') || declaredCapabilities.length === 0

  const levels: ('low' | 'medium' | 'high')[] = []
  const tryLevel = async (level: 'low' | 'medium' | 'high') => {
    try {
      await client.generate({
        model,
        prompt: 'hi',
        stream: false,
        think: level as any,
        keep_alive: 0 as any,
        options: { num_predict: 1 } as any,
      } as any)
      return true
    } catch (e) {
      const msg = String((e as Error)?.message || e || '')
      if (/unsupported|think/i.test(msg)) return false
      return false
    }
  }
  const [lowOk, medOk, highOk] = await Promise.all([tryLevel('low'), tryLevel('medium'), tryLevel('high')])
  if (lowOk) levels.push('low')
  if (medOk) levels.push('medium')
  if (highOk) levels.push('high')

  return {
    model,
    capabilities: { completion: hasCompletion, vision: hasVision },
    think: { supported: levels.length > 0, levels },
  }
}

export const modelsService = {
  ping,
  listAvailableModels,
  showModel,
  pullModel,
  deleteModel,
  getCapabilities,
}

export type ModelsService = typeof modelsService


