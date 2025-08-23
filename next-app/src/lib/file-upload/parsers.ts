import type { FileUploadItem, SupportedFileType } from './types'

export async function parseFile(file: File, fileType: SupportedFileType): Promise<FileUploadItem> {
  const fileName = file.name
  const mimeType = file.type
  
  if (fileType === 'image') {
    // For images, read as base64
    const base64Data = await fileToBase64(file)
    return {
      data: base64Data,
      mimeType,
      fileName,
      fileType
    }
  } else if (fileType === 'pdf') {
    // For PDFs, read as base64 and mark as processing
    const base64Data = await fileToBase64(file)
    return {
      data: base64Data,
      mimeType,
      fileName,
      fileType,
      isProcessing: true
    }
  } else {
    // For text/code files, read as text content
    const content = await fileToText(file)
    return {
      data: content, // Store text content in data field for consistency
      mimeType: 'text/plain', // Normalize mime type for text processing
      fileName,
      fileType,
      content
    }
  }
}

export function formatTextFilesForPrompt(files: FileUploadItem[]): string {
  const textFiles = files.filter(f => f.fileType === 'text' || f.fileType === 'code' || f.fileType === 'pdf')
  
  if (textFiles.length === 0) {
    return ''
  }
  
  // Just list the filenames, don't include content automatically
  const fileList = textFiles.map(file => `- ${file.fileName}`).join('\n')
  
  return `\n\n## Attached Files\n${fileList}\n\n(File contents available for analysis upon request)`
}

export function formatTextFilesWithContent(files: FileUploadItem[]): string {
  const textFiles = files.filter(f => f.fileType === 'text' || f.fileType === 'code' || f.fileType === 'pdf')
  
  if (textFiles.length === 0) {
    return ''
  }
  
  const sections = textFiles.map(file => {
    return `### ${file.fileName}\n\n${file.content || file.data}\n`
  })
  
  return `\n\n## Attached Files\n\n${sections.join('\n')}`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64Data = result.split(',')[1]
      if (!base64Data) {
        reject(new Error('Failed to convert file to base64'))
        return
      }
      resolve(base64Data)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result)
    }
    reader.onerror = () => reject(new Error('Failed to read file as text'))
    reader.readAsText(file)
  })
}
