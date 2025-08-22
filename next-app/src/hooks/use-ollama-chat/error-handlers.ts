import { toast } from 'sonner'

export type OllamaErrorType = 
  | 'CONNECTION_REFUSED'
  | 'SERVER_UNAVAILABLE' 
  | 'MODEL_NOT_FOUND'
  | 'STREAMING_INTERRUPTED'
  | 'INFERENCE_FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN'

export interface OllamaError {
  type: OllamaErrorType
  message: string
  isRetryable: boolean
  shouldShowToast: boolean
  userMessage: string
}

// === Error Detection ===

export function detectOllamaErrorType(error: unknown): OllamaErrorType {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const lowerMessage = errorMessage.toLowerCase()

  if (/econnrefused|fetch failed|enotfound|ehostunreach/i.test(errorMessage)) {
    return 'CONNECTION_REFUSED'
  }
  
  if (/timeout|timed out/i.test(errorMessage)) {
    return 'TIMEOUT'
  }
  
  if (/model.*not found|model.*doesn't exist/i.test(errorMessage)) {
    return 'MODEL_NOT_FOUND'
  }
  
  if (/aborted|cancelled|interrupted/i.test(errorMessage)) {
    return 'STREAMING_INTERRUPTED'
  }
  
  if (/ollama.*unavailable|service unavailable|502|503/i.test(errorMessage)) {
    return 'SERVER_UNAVAILABLE'
  }

  if (/inference|generation.*failed/i.test(errorMessage)) {
    return 'INFERENCE_FAILED'
  }

  return 'UNKNOWN'
}

export function createOllamaError(error: unknown, context?: string): OllamaError {
  const type = detectOllamaErrorType(error)
  const originalMessage = error instanceof Error ? error.message : String(error)

  switch (type) {
    case 'CONNECTION_REFUSED':
      return {
        type,
        message: originalMessage,
        isRetryable: true,
        shouldShowToast: false, // We'll show in chat instead
        userMessage: 'Unable to connect to Ollama. Please ensure Ollama is running (`ollama serve`) and try again.'
      }

    case 'SERVER_UNAVAILABLE':
      return {
        type,
        message: originalMessage,
        isRetryable: true,
        shouldShowToast: false,
        userMessage: 'Ollama server is temporarily unavailable. Please check the service and try again.'
      }

    case 'MODEL_NOT_FOUND':
      return {
        type,
        message: originalMessage,
        isRetryable: false,
        shouldShowToast: true, // This needs immediate attention
        userMessage: 'The selected model is not available. Please choose a different model or install the required model using `ollama pull <model-name>`.'
      }

    case 'STREAMING_INTERRUPTED':
      return {
        type,
        message: originalMessage,
        isRetryable: true,
        shouldShowToast: false,
        userMessage: 'Response generation was interrupted. Please try again.'
      }

    case 'INFERENCE_FAILED':
      return {
        type,
        message: originalMessage,
        isRetryable: true,
        shouldShowToast: false,
        userMessage: 'The model encountered an error while generating a response. Please try again or try with a different model.'
      }

    case 'TIMEOUT':
      return {
        type,
        message: originalMessage,
        isRetryable: true,
        shouldShowToast: false,
        userMessage: 'Request timed out. The model may be taking too long to respond. Please try again.'
      }

    case 'UNKNOWN':
    default:
      return {
        type: 'UNKNOWN',
        message: originalMessage,
        isRetryable: true,
        shouldShowToast: false,
        userMessage: 'An unexpected error occurred. Please check that Ollama is running and try again.'
      }
  }
}

// === Error Handling Functions ===

export function handleFetchError(error: unknown, context?: string): OllamaError {
  const ollamaError = createOllamaError(error, context)
  
  if (ollamaError.shouldShowToast) {
    toast.error('Chat Error', { 
      description: ollamaError.userMessage 
    })
  }

  console.warn(`[chat] ${context || 'operation'} failed:`, ollamaError.message)
  return ollamaError
}

export function handleStreamingError(error: unknown, context?: string): OllamaError {
  const ollamaError = createOllamaError(error, `streaming ${context || ''}`)
  
  // Streaming errors are usually shown in chat, not as toasts
  if (ollamaError.type === 'MODEL_NOT_FOUND') {
    toast.error('Model Error', { 
      description: ollamaError.userMessage 
    })
  }

  console.warn(`[chat] streaming ${context || 'operation'} failed:`, ollamaError.message)
  return ollamaError
}

export function handleStreamChunkError(errorData: any): OllamaError {
  const errorMessage = String(errorData?.error || 'Unknown streaming error occurred')
  return createOllamaError(new Error(errorMessage), 'stream chunk')
}

// === API Response Error Parsing ===

export async function parseApiErrorResponse(response: Response): Promise<OllamaError> {
  let detail = ''
  let errorCode = ''
  
  try {
    const data = await response.json()
    detail = String(data?.error || '')
    errorCode = String(data?.code || '')
  } catch {
    // Failed to parse JSON response
  }

  const errorMessage = detail || `HTTP ${response.status}: ${response.statusText}`
  const error = new Error(errorMessage)

  // Add context from error codes
  if (errorCode === 'OLLAMA_UNAVAILABLE') {
    return createOllamaError(new Error('Ollama service is not available'), 'API call')
  }
  
  if (errorCode === 'OLLAMA_CHAT_ERROR') {
    return createOllamaError(new Error(detail || 'Chat API error'), 'API call')
  }

  return createOllamaError(error, 'API call')
}

// === Retry Logic ===

export function shouldRetryError(errorType: OllamaErrorType): boolean {
  const retryableErrors: OllamaErrorType[] = [
    'CONNECTION_REFUSED',
    'SERVER_UNAVAILABLE',
    'STREAMING_INTERRUPTED', 
    'INFERENCE_FAILED',
    'TIMEOUT',
    'UNKNOWN'
  ]
  
  return retryableErrors.includes(errorType)
}

export function getRetryDelay(errorType: OllamaErrorType, attemptNumber: number): number {
  const baseDelays: Record<OllamaErrorType, number> = {
    'CONNECTION_REFUSED': 1000,
    'SERVER_UNAVAILABLE': 2000,
    'STREAMING_INTERRUPTED': 500,
    'INFERENCE_FAILED': 1000,
    'TIMEOUT': 2000,
    'MODEL_NOT_FOUND': 0, // Don't retry
    'UNKNOWN': 1000,
  }
  
  const baseDelay = baseDelays[errorType] || 1000
  
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attemptNumber - 1)
  const jitter = Math.random() * 0.1 * exponentialDelay
  
  return Math.min(exponentialDelay + jitter, 10000) // Cap at 10 seconds
}

// === User-Friendly Error Messages ===

export function getRetryButtonText(errorType: OllamaErrorType): string {
  switch (errorType) {
    case 'CONNECTION_REFUSED':
      return 'Retry Connection'
    case 'SERVER_UNAVAILABLE':
      return 'Retry Request' 
    case 'STREAMING_INTERRUPTED':
      return 'Retry Generation'
    case 'INFERENCE_FAILED':
      return 'Try Again'
    case 'TIMEOUT':
      return 'Retry (May Take Time)'
    case 'MODEL_NOT_FOUND':
      return 'Choose Different Model'
    default:
      return 'Retry'
  }
}

export function formatErrorMessageForDisplay(ollamaError: OllamaError): string {
  const emoji = getErrorEmoji(ollamaError.type)
  const retryText = ollamaError.isRetryable 
    ? '\n\nClick the retry button to try again.' 
    : ''
  
  return `${emoji} ${ollamaError.userMessage}${retryText}`
}

function getErrorEmoji(errorType: OllamaErrorType): string {
  switch (errorType) {
    case 'CONNECTION_REFUSED':
    case 'SERVER_UNAVAILABLE':
      return '🔌'
    case 'MODEL_NOT_FOUND':
      return '🤖'
    case 'STREAMING_INTERRUPTED':
      return '⏸️'
    case 'INFERENCE_FAILED':
      return '⚠️'
    case 'TIMEOUT':
      return '⏱️'
    default:
      return '❌'
  }
}

// === Debug Utilities ===

export function logErrorDetails(error: OllamaError, context?: string): void {
  console.group(`[chat] ${context || 'Error'} Details`)
  console.log('Type:', error.type)
  console.log('Retryable:', error.isRetryable)
  console.log('Show Toast:', error.shouldShowToast)
  console.log('User Message:', error.userMessage)
  console.log('Original Message:', error.message)
  console.groupEnd()
}
