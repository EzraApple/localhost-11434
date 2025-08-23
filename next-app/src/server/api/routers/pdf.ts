import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import type { PDFExtractionResult } from '~/lib/pdf'

/**
 * Convert base64 PDF data to ArrayBuffer (server-side only)
 */
function base64ToArrayBuffer(base64Data: string): ArrayBuffer {
  try {
    const binaryString = atob(base64Data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  } catch (error) {
    console.error('❌ Base64 conversion failed:', error)
    throw new Error('Failed to decode base64 PDF data')
  }
}

/**
 * Extract text content from a PDF file (server-side only)
 */
async function extractPDFText(buffer: ArrayBuffer): Promise<PDFExtractionResult> {
  try {
    // Dynamic import of pdfreader (pure JavaScript PDF parser)
    // @ts-ignore - No types available for pdfreader
    const { PdfReader } = await import('pdfreader')
    
    // Convert ArrayBuffer to Buffer
    const pdfBuffer = Buffer.from(buffer)
    
    // Extract text using pdfreader
    return new Promise((resolve, reject) => {
      const textItems: string[] = []
      let pageCount = 0
      let hasError = false
      
      new PdfReader().parseBuffer(pdfBuffer, (err: any, item: any) => {
        if (err) {
          if (!hasError) {
            hasError = true
            console.error('PDF parsing error:', err)
            resolve({
              text: null,
              error: `Failed to parse PDF: ${err.message}`
            })
          }
          return
        }
        
        if (!item) {
          // End of parsing
          if (hasError) return
          
          // Combine all text items
          const fullText = textItems.join(' ').trim()
          
          console.log('📝 Extracted', fullText.length, 'characters from', pageCount, 'pages')
          
          // Check if we got any meaningful text content
          if (!fullText || fullText.length === 0) {
            resolve({
              text: null,
              error: 'No text found in this PDF. It is likely a scanned document.',
              pageCount
            })
            return
          }

          // Check for very short text (might indicate scanning artifacts)
          if (fullText.length < 10) {
            resolve({
              text: null,
              error: 'Minimal text content found in this PDF. It may be a scanned document or contain primarily images.',
              pageCount
            })
            return
          }

          resolve({
            text: fullText,
            pageCount
          })
        } else if (item.page) {
          // New page detected
          pageCount = Math.max(pageCount, item.page)
        } else if (item.text) {
          // Text item found
          textItems.push(item.text)
        }
      })
    })
  } catch (error) {
    console.error('❌ PDF extraction error:', error)
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    
    // More specific error messages based on common PDF issues
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    if (errorMessage.includes('Invalid PDF')) {
      return {
        text: null,
        error: 'Invalid PDF file format.'
      }
    }
    
    if (errorMessage.includes('encrypted') || errorMessage.includes('password')) {
      return {
        text: null,
        error: 'This PDF is password-protected and cannot be processed.'
      }
    }
    
    return {
      text: null,
      error: `Failed to extract text from PDF: ${errorMessage}`
    }
  }
}

export const pdfRouter = createTRPCRouter({
  extractText: publicProcedure
    .input(z.object({
      data: z.string().min(1), // base64 PDF data
      fileName: z.string().min(1)
    }))
    .mutation(async ({ input }): Promise<PDFExtractionResult & { fileName: string }> => {
      console.log('🚀 PDF extraction started for:', input.fileName)
      
      try {
        // Convert base64 to ArrayBuffer
        const buffer = base64ToArrayBuffer(input.data)
        
        // Extract text from PDF
        const result = await extractPDFText(buffer)
        
        console.log('✅ PDF extraction completed for:', input.fileName, 'Text found:', !!result.text, "text", result.text)
        
        // Return result with filename for context
        return {
          ...result,
          fileName: input.fileName
        }
      } catch (error) {
        console.error('❌ PDF processing error:', error)
        return {
          text: null,
          error: error instanceof Error ? error.message : 'Failed to process PDF file',
          fileName: input.fileName
        }
      }
    })
})
