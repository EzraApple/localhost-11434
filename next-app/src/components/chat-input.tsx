'use client'

import { useEffect, useMemo, useRef, useState, type FormEventHandler } from 'react'
import { Brain, X, Loader2, FileText } from 'lucide-react'
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputFileUpload,
} from '~/components/ai-elements/prompt-input'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { useOllamaModelCapabilities } from '~/hooks/use-ollama-model-capabilities'
import { useModelCapabilitiesCache } from '~/hooks/use-model-capabilities-cache'
import { useModelPreload } from '~/hooks/use-model-preload'
import { getModelFileCapabilities, getSupportedFileTypesDescription, getAcceptedFileTypes, hasImagesInFiles, hasPDFsInFiles, hasProcessingFiles, type FileUploadItem } from '~/lib/file-upload'
import { formatPDFForPrompt } from '~/lib/pdf'
import { api } from '~/trpc/react'
import { toast } from 'sonner'

type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

export type ChatInputModel = { name: string }

export type ChatInputProps = {
  models: ChatInputModel[]
  defaultModel?: string
  chatId?: string
  defaultSystemPromptId?: string
  placeholder?: string
  prefillText?: string
  onSubmit?: (payload: { text: string; model: string; reasoningLevel: 'low' | 'medium' | 'high'; systemPromptContent?: string; systemPromptId?: string | 'none'; images?: Array<{ data: string; mimeType: string; fileName: string }>; files?: Array<FileUploadItem>; userMessage?: any }) => void
  onStop?: () => void
  onTypingStart?: () => void
  onTypingStop?: () => void
  autoClear?: boolean
  initialAutoSubmit?: boolean
  status?: ChatStatus
  placement?: 'viewport' | 'container' | 'page'
  maxWidthClass?: string
  uploadedImages?: Array<{ data: string; mimeType: string; fileName: string }>
  onImagesChange?: (images: Array<{ data: string; mimeType: string; fileName: string }>) => void
  uploadedFiles?: Array<FileUploadItem>
  onFilesChange?: (files: Array<FileUploadItem>) => void
  hasImagesInHistory?: boolean
}

export function ChatInput({ models, defaultModel, chatId, defaultSystemPromptId, placeholder = 'Type your message…', prefillText, onSubmit, onStop, onTypingStart, onTypingStop, autoClear = true, initialAutoSubmit = false, status: externalStatus, placement = 'viewport', maxWidthClass = 'max-w-3xl', uploadedImages: externalImages, onImagesChange, uploadedFiles: externalFiles, onFilesChange, hasImagesInHistory = false }: ChatInputProps) {
  const [text, setText] = useState('')
  const [model, setModel] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<Array<FileUploadItem>>(externalFiles || [])
  const hasCalledTypingStart = useRef(false)
  const isTextFromPrefill = useRef(false)
  const isInitialAutoSubmit = useRef(initialAutoSubmit)
  const hasCleared = useRef(false)
  const status = externalStatus ?? 'ready'
  const [reasoningLevel, setReasoningLevel] = useState<'low' | 'medium' | 'high'>('high')
  const { data: caps, error: capsError, thinkLevels } = useOllamaModelCapabilities(model)
  const { getCapabilities } = useModelCapabilitiesCache(models)
  const { preloadModel } = useModelPreload()
  const { data: promptData } = api.systemPrompts.list.useQuery(undefined, { refetchOnWindowFocus: false })
  const systemPrompts = promptData?.prompts ?? []
  
  // PDF processing
  const pdfExtractMutation = api.pdf.extractText.useMutation({
    onSuccess: (result) => {
      setUploadedFiles(prevFiles => 
        prevFiles.map(file => 
          file.fileName === result.fileName && file.fileType === 'pdf'
            ? {
                ...file,
                isProcessing: false,
                content: result.text ? formatPDFForPrompt(result, result.fileName) : result.error || 'No text found',
                processingError: result.text ? undefined : result.error
              }
            : file
        )
      )
    },
    onError: (error) => {
      setUploadedFiles(prevFiles => 
        prevFiles.map(file => 
          file.fileType === 'pdf' && file.isProcessing
            ? {
                ...file,
                isProcessing: false,
                processingError: 'Failed to process PDF',
                content: 'Failed to extract text from PDF'
              }
            : file
        )
      )
      toast.error('PDF processing failed', { 
        description: error.message || 'Could not extract text from PDF' 
      })
    }
  })
  const [systemPromptId, setSystemPromptId] = useState<string>('none')
  
  // Get current model capabilities for file upload
  const currentModelCaps = getCapabilities(model) || caps
  const fileCapabilities = getModelFileCapabilities(currentModelCaps)
  
  // Legacy image support - convert to new format
  const legacyImages = externalImages || []
  const convertedLegacyImages: FileUploadItem[] = legacyImages.map(img => ({
    data: img.data,
    mimeType: img.mimeType,
    fileName: img.fileName,
    fileType: 'image' as const
  }))
  
  // Combine legacy images with new files
  const allFiles = [...convertedLegacyImages, ...uploadedFiles]

  // Sync with external files
  useEffect(() => {
    if (externalFiles) {
      setUploadedFiles(externalFiles)
    }
  }, [externalFiles])

  // Update external files when internal state changes
  const handleFilesChange = (files: Array<FileUploadItem>) => {
    setUploadedFiles(files)
    onFilesChange?.(files)
    
    // Legacy image support - extract images for backward compatibility
    const imageFiles = files.filter(f => f.fileType === 'image')
    const legacyImages = imageFiles.map(f => ({
      data: f.data,
      mimeType: f.mimeType,
      fileName: f.fileName
    }))
    onImagesChange?.(legacyImages)
    
    // Process PDFs automatically
    const newPDFs = files.filter(f => f.fileType === 'pdf' && f.isProcessing)
    if (newPDFs.length > 0) {
      // Show one-time toast about PDF text-only support
      try {
        const hasSeenPDFToast = localStorage.getItem('ollama-pdf-toast-seen')
        if (!hasSeenPDFToast) {
          toast.info('PDF Processing', {
            description: 'Only text-based PDFs are supported. Scanned documents may not extract properly.',
            duration: 5000
          })
          localStorage.setItem('ollama-pdf-toast-seen', 'true')
        }
      } catch {
        // Fallback if localStorage is not available
        toast.info('PDF Processing', {
          description: 'Only text-based PDFs are supported. Scanned documents may not extract properly.',
          duration: 3000
        })
      }
      
      // Process each new PDF
      newPDFs.forEach(pdf => {
        pdfExtractMutation.mutate({
          data: pdf.data,
          fileName: pdf.fileName
        })
      })
    }
  }

  // initialize and persist selected system prompt (like model)
  useEffect(() => {
    try {
      const perChatKey = chatId ? `ollama:chat:${chatId}:systemPromptId` : null
      const globalKey = 'ollama:selectedSystemPromptId'
      const tryDefault = defaultSystemPromptId
      const isValid = (val: string | undefined | null) => !!val && (val === 'none' || systemPrompts.some((p: any) => p.id === val))
      const fromDefault = isValid(tryDefault) ? (tryDefault as string) : null
      const fromPerChat = isValid(perChatKey ? localStorage.getItem(perChatKey) : null) ? (localStorage.getItem(perChatKey as string) as string) : null
      const fromGlobal = isValid(localStorage.getItem(globalKey)) ? (localStorage.getItem(globalKey) as string) : null
      const next = fromDefault ?? fromPerChat ?? fromGlobal ?? 'none'
      if (next !== systemPromptId) setSystemPromptId(next)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptData, chatId, defaultSystemPromptId])

  useEffect(() => {
    try {
      const globalKey = 'ollama:selectedSystemPromptId'
      localStorage.setItem(globalKey, systemPromptId)
      if (chatId) {
        localStorage.setItem(`ollama:chat:${chatId}:systemPromptId`, systemPromptId)
      }
    } catch {}
  }, [systemPromptId, chatId])

  const effectiveDefault = useMemo(() => defaultModel ?? models[0]?.name ?? '', [defaultModel, models])

  useEffect(() => {
    if (!model && effectiveDefault) setModel(effectiveDefault)
  }, [effectiveDefault, model])

  // apply prefill text when provided
  useEffect(() => {
    if (typeof prefillText === 'string') {
      setText(prefillText)
      isTextFromPrefill.current = true
    }
  }, [prefillText])

  // adjust reasoning level to a supported one when model changes
  useEffect(() => {
    if (!model) return
    if (thinkLevels.size === 0) {
      // no think support; clear selection by setting to 'high' but we will not send it
      setReasoningLevel('high')
      return
    }
    if (!thinkLevels.has(reasoningLevel)) {
      // pick highest available level
      const pick = (thinkLevels.has('high') && 'high') || (thinkLevels.has('medium') && 'medium') || 'low'
      setReasoningLevel(pick as any)
    }
  }, [model, thinkLevels])

  useEffect(() => {
    if (capsError) toast.error('Model capabilities error', { description: String((capsError as any)?.message || capsError) })
  }, [capsError])

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    if (!text.trim() && allFiles.length === 0) return
    
    // Create a structured user message with text and file parts
    const textParts = text.trim() ? [{ type: 'text' as const, text: text.trim() }] : []
    const fileParts = allFiles.map(file => {
      if (file.fileType === 'image') {
        return {
          type: 'image' as const,
          data: file.data,
          mimeType: file.mimeType,
          fileName: file.fileName
        }
      } else {
        return {
          type: 'file' as const,
          data: file.data,
          mimeType: file.mimeType,
          fileName: file.fileName,
          content: file.content,
          fileType: file.fileType
        }
      }
    })
    
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      parts: [...textParts, ...fileParts]
    }
    
    // For model consumption, keep original text - file content will be added automatically during processing
    const modelText = text.trim()
    
    // Extract images for legacy support
    const imageFiles = allFiles.filter(f => f.fileType === 'image')
    const legacyImages = imageFiles.map(f => ({
      data: f.data,
      mimeType: f.mimeType,
      fileName: f.fileName
    }))
    
    // if model doesn't support think, pass undefined to avoid enabling think
    const rl = thinkLevels.size > 0 && thinkLevels.has(reasoningLevel) ? reasoningLevel : undefined
    const selectedPrompt = systemPromptId !== 'none' ? systemPrompts.find((p: any) => p.id === systemPromptId) : undefined
    onSubmit?.({ 
      text: modelText, 
      model, 
      reasoningLevel: rl as any, 
      systemPromptContent: selectedPrompt?.content, 
      systemPromptId, 
      images: legacyImages,
      files: allFiles,
      userMessage // Pass the structured message for storage
    })
  }

  const handleStop = () => {
    onStop?.()
  }

  // Clear text and files immediately when status becomes 'submitted'
  useEffect(() => {
    if (status === 'submitted' && autoClear && !hasCleared.current) {
      hasCleared.current = true
      setText('')
      setUploadedFiles([])
      onFilesChange?.([])
      onImagesChange?.([])
    } else if (status === 'ready') {
      hasCleared.current = false
    }
  }, [status, autoClear, onFilesChange, onImagesChange])

  // Reset initial auto-submit flag after first submission
  useEffect(() => {
    if (status === 'submitted' && isInitialAutoSubmit.current) {
      isInitialAutoSubmit.current = false
    }
  }, [status])

  return (
    <div
      className={
        placement === 'viewport'
          ? "pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4"
          : placement === 'container'
            ? "pointer-events-none sticky bottom-0 z-40 px-4"
            : "pointer-events-none absolute inset-x-0 bottom-0 z-40 px-4"
      }
    >
      <div className={`mx-auto w-full ${maxWidthClass}`}>
        <div className={`
          relative border border-[#113936]/40 rounded-t-[20px] bg-transparent backdrop-blur-lg
          shadow-[0_80px_50px_0_rgba(0,0,0,0.1),0_50px_30px_0_rgba(0,0,0,0.07),0_30px_15px_0_rgba(0,0,0,0.06),0_15px_8px_rgba(0,0,0,0.04),0_6px_4px_rgba(0,0,0,0.04),0_2px_2px_rgba(0,0,0,0.02)]
          p-2 pb-0 pointer-events-auto transition-all duration-200
        `}>
          <PromptInput onSubmit={handleSubmit} className="mb-4 text-[#cfd6d4] bg-[#132524f0]">
            {allFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 border-b border-[#113936]/20">
                {allFiles.map((file, index) => (
                  <div key={index} className="relative group">
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-[#113936]/30 bg-[#1a2f2e]">
                      {file.fileType === 'image' ? (
                        <img
                          src={`data:${file.mimeType};base64,${file.data}`}
                          alt={file.fileName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-[#8b9491] text-xs p-1 relative">
                          {file.fileType === 'pdf' ? (
                            <>
                              <FileText className="w-6 h-6 text-[#d3e6e2] mb-1" />
                              <div className="text-[6px] text-[#8b9491] leading-tight truncate w-full max-w-[50px] text-center">
                                PDF
                              </div>
                              {file.isProcessing && (
                                <div className="absolute inset-0 bg-[#1a2f2e]/80 flex items-center justify-center rounded-lg">
                                  <Loader2 className="w-4 h-4 text-[#d3e6e2] animate-spin" />
                                </div>
                              )}
                              {file.processingError && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                                  <div className="w-1 h-1 bg-white rounded-full" />
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-center">
                              <div className="text-[8px] font-medium text-[#d3e6e2] mb-1">
                                {file.fileName.split('.').pop()?.toUpperCase() || 'FILE'}
                              </div>
                              <div className="text-[6px] text-[#8b9491] leading-tight truncate w-full max-w-[50px]">
                                {file.fileName}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            const newFiles = [...uploadedFiles]
                            const convertedIndex = index - convertedLegacyImages.length
                            if (convertedIndex >= 0) {
                              newFiles.splice(convertedIndex, 1)
                              handleFilesChange(newFiles)
                            }
                          }}
                          className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2a2a2a] border-[#404040] text-white shadow-lg">
                        <div className="font-medium">Remove File</div>
                        <div className="text-xs text-gray-400">{file.fileName}</div>
                        {file.fileType === 'pdf' && file.isProcessing && (
                          <div className="text-xs text-blue-400 mt-1">Processing PDF...</div>
                        )}
                        {file.fileType === 'pdf' && file.processingError && (
                          <div className="text-xs text-red-400 mt-1">{file.processingError}</div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            )}
            <PromptInputTextarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                // Call onTypingStart when user starts typing (from empty to non-empty)
                // But not if the text was set via prefill
                if (!text && e.target.value && !hasCalledTypingStart.current && !isTextFromPrefill.current) {
                  hasCalledTypingStart.current = true
                  
                  // Preload the current model to warm it up
                  if (model) {
                    preloadModel(model)
                  }
                  
                  // Call the original onTypingStart callback
                  onTypingStart?.()
                }
                // Call onTypingStop when user deletes all text (from non-empty to empty)
                if (text && !e.target.value && onTypingStop && hasCalledTypingStart.current) {
                  hasCalledTypingStart.current = false
                  onTypingStop()
                }
                // Reset prefill flag when user starts modifying the text
                if (isTextFromPrefill.current && e.target.value !== prefillText) {
                  isTextFromPrefill.current = false
                }
              }}
              placeholder={placeholder}
            />
            <PromptInputToolbar>
              <div className="flex items-center gap-2">
                <PromptInputModelSelect onValueChange={setModel} value={model}>
                  <PromptInputModelSelectTrigger className="h-8">
                    <PromptInputModelSelectValue />
                  </PromptInputModelSelectTrigger>
                  <PromptInputModelSelectContent>
                    {models.map((m) => {
                      const modelCaps = getCapabilities(m.name)
                      const hasCurrentImages = hasImagesInFiles(allFiles)
                      const hasAnyImages = hasCurrentImages || hasImagesInHistory
                      const isDisabled = hasAnyImages && !modelCaps?.capabilities?.vision
                      return (
                        <PromptInputModelSelectItem 
                          key={m.name} 
                          value={m.name}
                          disabled={isDisabled}
                          className={isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                        >
                          {m.name}
                          {isDisabled && ' (No vision support)'}
                        </PromptInputModelSelectItem>
                      )
                    })}
                  </PromptInputModelSelectContent>
                </PromptInputModelSelect>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <PromptInputFileUpload
                        onFilesSelected={(files) => {
                          const typedFiles = files.map(f => ({
                            ...f,
                            fileType: f.fileType || 'text' as const
                          })) as FileUploadItem[]
                          handleFilesChange([...uploadedFiles, ...typedFiles])
                        }}
                        disabled={false}
                        accept={getAcceptedFileTypes(fileCapabilities)}
                        maxFiles={fileCapabilities.maxFiles}
                        tooltip={getSupportedFileTypesDescription(fileCapabilities)}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2a2a2a] border-[#404040] text-white shadow-lg max-w-xs">
                    <div className="font-medium">File Upload</div>
                    <div className="text-xs text-gray-400">{getSupportedFileTypesDescription(fileCapabilities)}</div>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <PromptInputModelSelect onValueChange={(v) => setSystemPromptId(v)} value={systemPromptId}>
                        <PromptInputModelSelectTrigger className="h-8">
                          <PromptInputModelSelectValue />
                        </PromptInputModelSelectTrigger>
                        <PromptInputModelSelectContent>
                          <PromptInputModelSelectItem key={'none'} value={'none'}>
                            Default
                          </PromptInputModelSelectItem>
                          {systemPrompts.map((p: any) => (
                            <PromptInputModelSelectItem key={p.id} value={p.id}>
                              {p.title}
                            </PromptInputModelSelectItem>
                          ))}
                        </PromptInputModelSelectContent>
                      </PromptInputModelSelect>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2a2a2a] border-[#404040] text-white shadow-lg">
                    <div className="font-medium">System Prompt</div>
                    <div className="text-xs text-gray-400">Guide the AI's behavior and responses</div>
                  </TooltipContent>
                </Tooltip>
                
                {thinkLevels.size > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <PromptInputModelSelect onValueChange={(v) => setReasoningLevel(v as any)} value={reasoningLevel}>
                          <PromptInputModelSelectTrigger className="h-8">
                            <PromptInputModelSelectValue>
                              <div className="inline-flex items-center gap-1 text-xs">
                                <Brain className="h-3.5 w-3.5" />
                                <span className="capitalize">{reasoningLevel}</span>
                              </div>
                            </PromptInputModelSelectValue>
                          </PromptInputModelSelectTrigger>
                          <PromptInputModelSelectContent>
                            {(['low','medium','high'] as const).filter(level => thinkLevels.has(level)).map(level => (
                              <PromptInputModelSelectItem key={level} value={level}>
                                <span className="capitalize">{level}</span>
                              </PromptInputModelSelectItem>
                            ))}
                          </PromptInputModelSelectContent>
                        </PromptInputModelSelect>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-[#2a2a2a] border-[#404040] text-white shadow-lg max-w-xs">
                      <div className="font-medium">Reasoning Level</div>
                      <div className="text-xs text-gray-400">Low (fast), Medium (balanced), High (thorough)</div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div />
              <PromptInputSubmit 
                disabled={
                  status === 'streaming' 
                    ? false // Always enabled when streaming (for stop functionality)
                    : ((!text && allFiles.length === 0) || hasProcessingFiles(allFiles) || status !== 'ready')
                } 
                status={status}
                onClick={status === 'streaming' ? handleStop : undefined}
                type={status === 'streaming' ? 'button' : 'submit'}
              />
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>
    </div>
  )
}

export default ChatInput


