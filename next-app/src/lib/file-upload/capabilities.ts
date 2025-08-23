import type { ModelFileCapabilities } from './types'
import type { ModelCapabilities } from '~/hooks/use-ollama-model-capabilities'

export function getModelFileCapabilities(modelCapabilities?: ModelCapabilities | null): ModelFileCapabilities {
  if (!modelCapabilities?.capabilities) {
    // Default to text-only capabilities when model capabilities are unknown
    return {
      images: false,
      textFiles: true,
      pdfs: true, // PDFs get converted to text so all models support them
      maxFiles: 10
    }
  }
  
  return {
    images: modelCapabilities.capabilities.vision,
    textFiles: true, // All models support text files
    pdfs: true, // PDFs get converted to text so all models support them
    maxFiles: modelCapabilities.capabilities.vision ? 15 : 10 // Allow more files for vision models
  }
}

export function hasImagesInFiles(files: Array<{ fileType?: string }>): boolean {
  return files.some(file => file.fileType === 'image' || !file.fileType) // Consider legacy format as images
}

export function hasPDFsInFiles(files: Array<{ fileType?: string }>): boolean {
  return files.some(file => file.fileType === 'pdf')
}

export function hasProcessingFiles(files: Array<{ isProcessing?: boolean }>): boolean {
  return files.some(file => file.isProcessing === true)
}
