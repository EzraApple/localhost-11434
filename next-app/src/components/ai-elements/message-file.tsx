import { FileText, Image } from 'lucide-react'

export type MessageFileProps = {
  data: string
  mimeType: string
  fileName: string
  fileType?: string
  content?: string
}

export const MessageFile = ({ data, mimeType, fileName, fileType, content }: MessageFileProps) => {
  // For images, display the actual image
  if (fileType === 'image' || mimeType.startsWith('image/')) {
    return (
      <div className="inline-block max-w-sm rounded-lg overflow-hidden border border-border bg-muted">
        <img
          src={`data:${mimeType};base64,${data}`}
          alt={fileName}
          className="w-full h-auto max-h-96 object-contain"
        />
        <div className="p-2 text-xs text-muted-foreground">
          {fileName}
        </div>
      </div>
    )
  }

  // For text/code files, show as an attachment card
  return (
    <div className="inline-flex items-center gap-2 p-2 rounded-lg border border-[#113936]/30 bg-[#132827]/50 max-w-xs">
      <div className="flex-shrink-0">
        <FileText className="w-4 h-4 text-[#8b9491]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate text-[#d3e6e2]">
          {fileName}
        </div>
        <div className="text-xs text-[#8b9491]">
          {fileType?.toUpperCase() || 'FILE'}
        </div>
      </div>
    </div>
  )
}
