// Client-side types and utilities (no server-side imports)

export type PDFExtractionResult = {
  text: string | null
  error?: string
  pageCount?: number
  metadata?: {
    title?: string
    author?: string
    creator?: string
  }
}

/**
 * Format PDF extraction result for use in chat prompts (client-side utility)
 * @param result - PDF extraction result
 * @param fileName - Original filename for context
 * @returns Formatted text for inclusion in chat
 */
export function formatPDFForPrompt(result: PDFExtractionResult, fileName: string): string {
  if (result.text) {
    const metadata = result.metadata
    const metadataStr = metadata && (metadata.title || metadata.author) 
      ? `\n**Metadata:** ${[
          metadata.title && `Title: ${metadata.title}`,
          metadata.author && `Author: ${metadata.author}`
        ].filter(Boolean).join(', ')}\n`
      : ''
    
    return `**PDF Content from "${fileName}":**${metadataStr}\n${result.text}`
  } else {
    return `**PDF "${fileName}":** ${result.error || 'No text content available'}`
  }
}
