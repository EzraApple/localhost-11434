"use client"

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '~/trpc/react'
import { toast } from 'sonner'
import { useChatStore } from '~/lib/chat-store'
import ChatInput from '~/components/chat-input'
import { Loader2, Paperclip } from 'lucide-react'
import { parseFile, getFileType, getSupportedFileTypesDescription, getModelFileCapabilities, type FileUploadItem } from '~/lib/file-upload'
import { useModelCapabilitiesCache } from '~/hooks/use-model-capabilities-cache'
import { useModelPreload } from '~/hooks/use-model-preload'

type ModelInfo = { name: string }

export default function Home() {
  const router = useRouter()
  const { createChat, selectChat, selectedModel: storedModel, setSelectedModel } = useChatStore()
  const { data, error } = api.models.list.useQuery()
  const models: ModelInfo[] = data?.models ?? []
  const [selectedModel, setSelectedModelState] = useState(storedModel ?? '')
  const [isNavigating, setIsNavigating] = useState(false)

  useEffect(() => {
    if (models.length && !selectedModel) {
      const m = storedModel ?? models[0]!.name
      setSelectedModelState(m)
      setSelectedModel(m)
    }
  }, [models, selectedModel, setSelectedModel, storedModel])

  useEffect(() => {
    if (error) {
      const msg = (error as any)?.message ?? 'Failed to load models'
      toast.error('Models unavailable', { description: String(msg) })
    }
  }, [error])

  const basePrompts: string[] = [
    'Summarize this document',
    'Draft an email to the team about the product update',
    'Explain this code and suggest improvements',
    'Generate test cases for this function',
  ]

  const [prefill, setPrefill] = useState<string>('')
  const [isUserTyping, setIsUserTyping] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<Array<FileUploadItem>>([])
  const [isDragOver, setIsDragOver] = useState(false)
  
  // Get model capabilities for file type display
  const { getCapabilities } = useModelCapabilitiesCache(models)
  const currentModelCaps = getCapabilities(selectedModel)
  const fileCapabilities = getModelFileCapabilities(currentModelCaps)
  const supportedTypesDescription = getSupportedFileTypesDescription(fileCapabilities)
  
  // Model preloading
  const { preloadModel } = useModelPreload()

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isDragOver) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    // Only set to false if we're leaving the component entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    
    try {
      const parsedFiles = await Promise.all(
        files.map(async (file) => {
          const fileType = getFileType(file)
          if (!fileType) {
            throw new Error(`Unsupported file type: ${file.name}`)
          }
          
          return await parseFile(file, fileType)
        })
      )
      
      setUploadedFiles(prev => [...prev, ...parsedFiles])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('File upload error', {
        description: message
      })
    }
  }

  return (
    <div
      className="relative min-h-dvh pb-40"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(closest-corner at 120px 36px, rgba(14, 78, 71, 0.16), rgba(14, 78, 71, 0.08)), linear-gradient(rgb(12, 24, 25) 15%, rgb(8, 14, 15))' }} />
        <div className="absolute inset-0 bg-noise" />
        <div className="absolute inset-0 bg-[#0a1616]/30" />
      </div>

      {/* Full window drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1515]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border border-[#2b3f3e]/30 bg-[#132827]/90 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[#22c55e]/10 flex items-center justify-center">
              <Paperclip className="w-8 h-8 text-[#22c55e]" />
            </div>
            <div className="text-center">
              <div className="text-[#e5e9e8] font-medium text-lg mb-2">Drop files here</div>
              <div className="text-[#8b9491] text-sm">{supportedTypesDescription}</div>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isNavigating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-lg bg-[#0a1616]/90 p-6 border border-[#113936]/40">
            <Loader2 className="h-8 w-8 animate-spin text-[#d3e6e2]" />
            <p className="text-sm text-[#d3e6e2]">Creating your chat...</p>
          </div>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-[calc(max(15vh,2.5rem))]">
        {!isUserTyping && (
          <>
            <h2 className="text-3xl font-semibold transition-opacity duration-300 ease-out">How can I help you?</h2>
            <div className="flex flex-row flex-wrap gap-2.5 text-sm transition-opacity duration-300 ease-out">
              {basePrompts.map((p) => (
                <button
                  key={p}
                  className="h-9 rounded-full px-5 py-2 font-semibold outline outline-1 outline-[#113936]/50 bg-[#113936]/15 text-[#d3e6e2] hover:bg-[#113936]/25 transition-all duration-300 ease-out"
                  type="button"
                  onClick={() => setPrefill(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <ChatInput
        models={models}
        defaultModel={selectedModel}
        prefillText={prefill}
        placement="page"
        maxWidthClass="max-w-3xl"
        uploadedFiles={uploadedFiles}
        onFilesChange={setUploadedFiles}
        hasImagesInHistory={false}
        onTypingStart={() => {
          setIsUserTyping(true)
          // Preload the selected model when user starts typing
          if (selectedModel) {
            preloadModel(selectedModel)
          }
        }}
        onTypingStop={() => setIsUserTyping(false)}
        onSubmit={async ({ text, model, systemPromptContent, systemPromptId, images, files, userMessage }) => {
          setIsNavigating(true)
          const id = crypto.randomUUID()

          // Create and select chat immediately
          createChat(id, 'New Chat', model)
          selectChat(id)
          setSelectedModel(model)

          // Store initial prompt in sessionStorage
          try {
            sessionStorage.setItem(`chat:${id}:initial`, JSON.stringify({
              q: text,
              m: model,
              s: systemPromptContent ?? null,
              sid: systemPromptId ?? null,
              images: images ?? null,
              files: files ?? null,
              userMessage: userMessage ?? null
            }))
          } catch {}

          // Small delay to ensure chat is properly created before navigation
          await new Promise(resolve => setTimeout(resolve, 50))

          // Clear the form after successful submission
          setPrefill('')
          setUploadedFiles([])
          
          // Navigate to chat page
          router.push(`/chat/${id}`)
        }}
      />
    </div>
  )
}
