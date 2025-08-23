export type SupportedFileType = 'image' | 'text' | 'code' | 'pdf'

export type FileUploadItem = {
  data: string
  mimeType: string
  fileName: string
  fileType: SupportedFileType
  content?: string // For text/code/pdf files - the parsed text content
  isProcessing?: boolean // For PDFs that are currently being processed
  processingError?: string // For PDFs that failed to process
}

export type FileTypeConfig = {
  extensions: string[]
  mimeTypes: string[]
  maxSizeMB: number
  description: string
}

export type ModelFileCapabilities = {
  images: boolean
  textFiles: boolean
  pdfs: boolean
  maxFiles: number
}

export const FILE_TYPE_CONFIGS: Record<SupportedFileType, FileTypeConfig> = {
  image: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    maxSizeMB: 10,
    description: 'Images (PNG, JPG, JPEG, GIF, WebP)'
  },
  text: {
    extensions: ['.txt', '.md', '.markdown', '.log', '.csv', '.json', '.xml', '.html', '.css', '.sql'],
    mimeTypes: ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/xml', 'text/html', 'text/css'],
    maxSizeMB: 5,
    description: 'Text files (TXT, MD, JSON, CSV, XML, HTML, CSS, SQL)'
  },
  code: {
    extensions: ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj', '.hs', '.ml', '.elm', '.dart', '.vue', '.svelte', '.yml', '.yaml', '.toml', '.ini', '.env', '.gitignore', '.dockerignore', '.eslintrc', '.prettierrc'],
    mimeTypes: ['text/javascript', 'application/javascript', 'text/typescript', 'text/x-python', 'text/x-java-source', 'text/x-c', 'text/x-c++', 'text/x-csharp', 'text/x-php', 'text/x-ruby', 'text/x-go', 'text/x-rust', 'text/x-swift', 'text/x-kotlin', 'text/x-scala', 'text/x-yaml', 'application/x-yaml'],
    maxSizeMB: 5,
    description: 'Code files (JS, TS, PY, JAVA, C++, and more)'
  },
  pdf: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    maxSizeMB: 10,
    description: 'PDF documents (text-based only)'
  }
}

export const COMMON_FILE_EXTENSIONS = [
  ...FILE_TYPE_CONFIGS.image.extensions,
  ...FILE_TYPE_CONFIGS.text.extensions,
  ...FILE_TYPE_CONFIGS.code.extensions,
  ...FILE_TYPE_CONFIGS.pdf.extensions
]
