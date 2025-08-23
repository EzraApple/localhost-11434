import { FILE_TYPE_CONFIGS, type SupportedFileType, type ModelFileCapabilities } from './types'

export function getFileType(file: File): SupportedFileType | null {
  const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`
  
  // Check each file type config
  for (const [fileType, config] of Object.entries(FILE_TYPE_CONFIGS)) {
    if (config.extensions.includes(extension) || config.mimeTypes.includes(file.type)) {
      return fileType as SupportedFileType
    }
  }
  
  return null
}

export function validateFile(file: File, capabilities: ModelFileCapabilities): {
  valid: boolean
  error?: string
  fileType?: SupportedFileType
} {
  const fileType = getFileType(file)
  
  if (!fileType) {
    return { valid: false, error: 'Unsupported file type' }
  }
  
  // Check if model supports this file type
  if (fileType === 'image' && !capabilities.images) {
    return { valid: false, error: 'This model does not support image files' }
  }
  
  if ((fileType === 'text' || fileType === 'code') && !capabilities.textFiles) {
    return { valid: false, error: 'This model does not support text files' }
  }
  
  if (fileType === 'pdf' && !capabilities.pdfs) {
    return { valid: false, error: 'This model does not support PDF files' }
  }
  
  // Check file size
  const config = FILE_TYPE_CONFIGS[fileType]
  const maxBytes = config.maxSizeMB * 1024 * 1024
  if (file.size > maxBytes) {
    return { valid: false, error: `File too large. Maximum size: ${config.maxSizeMB}MB` }
  }
  
  return { valid: true, fileType }
}

export function getAcceptedFileTypes(capabilities: ModelFileCapabilities): string {
  const acceptedTypes: string[] = []
  
  if (capabilities.images) {
    acceptedTypes.push(...FILE_TYPE_CONFIGS.image.extensions)
  }
  
  if (capabilities.textFiles) {
    acceptedTypes.push(...FILE_TYPE_CONFIGS.text.extensions)
    acceptedTypes.push(...FILE_TYPE_CONFIGS.code.extensions)
  }
  
  if (capabilities.pdfs) {
    acceptedTypes.push(...FILE_TYPE_CONFIGS.pdf.extensions)
  }
  
  return acceptedTypes.join(',')
}

export function getSupportedFileTypesDescription(capabilities: ModelFileCapabilities): string {
  const descriptions: string[] = []
  
  if (capabilities.images) {
    descriptions.push(FILE_TYPE_CONFIGS.image.description)
  }
  
  if (capabilities.textFiles) {
    descriptions.push(FILE_TYPE_CONFIGS.text.description)
    descriptions.push(FILE_TYPE_CONFIGS.code.description)
  }
  
  if (capabilities.pdfs) {
    descriptions.push(FILE_TYPE_CONFIGS.pdf.description)
  }
  
  if (descriptions.length === 0) {
    return 'No file uploads supported'
  }
  
  return descriptions.join(', ')
}
