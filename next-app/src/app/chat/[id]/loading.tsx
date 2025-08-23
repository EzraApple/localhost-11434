import { Skeleton } from "~/components/ui/skeleton"
import { Conversation, ConversationContent } from "~/components/ai-elements/conversation"

// Message skeleton that mimics the actual Message component structure
function MessageSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={`group flex w-full items-end justify-end gap-2 py-4 ${
      isUser ? 'is-user' : 'is-assistant flex-row-reverse justify-end'
    }`}>
      <div className={`flex flex-col ${isUser ? 'max-w-[88%]' : 'max-w-full w-full'}`}>
        {/* Message bubble */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          
          {/* Message content */}
          <div className="flex flex-col gap-2 flex-1">
            {isUser ? (
              /* User message - bubble style */
              <div className="bg-[#1a2828]/50 border border-[#2b3f3e]/30 rounded-2xl p-4 ml-auto max-w-fit">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : (
              /* Assistant message - full width */
              <div className="space-y-3 w-full">
                <Skeleton className="h-4 w-full max-w-2xl" />
                <Skeleton className="h-4 w-full max-w-xl" />
                <Skeleton className="h-4 w-full max-w-lg" />
                <Skeleton className="h-4 w-32" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Chat input skeleton that mimics the ChatInput component
function ChatInputSkeleton() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4">
      <div className="pointer-events-auto mx-auto w-full max-w-4xl">
        <div className="relative flex w-full flex-col rounded-2xl border border-[#2b3f3e]/30 bg-[#132827]/90 backdrop-blur-sm shadow-2xl">
          {/* Toolbar skeleton */}
          <div className="flex items-center justify-between p-3 border-b border-[#2b3f3e]/20">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-20" /> {/* Model select */}
              <Skeleton className="h-7 w-16" /> {/* System prompt */}
            </div>
            <div className="flex items-center gap-1">
              <Skeleton className="h-7 w-7 rounded" /> {/* File upload */}
              <Skeleton className="h-7 w-7 rounded" /> {/* Other tool */}
            </div>
          </div>
          
          {/* Input area skeleton */}
          <div className="flex items-end gap-3 p-4">
            <div className="flex-1 min-h-[44px]">
              <Skeleton className="h-11 w-full rounded-lg" /> {/* Text input */}
            </div>
            <Skeleton className="h-11 w-11 rounded-lg shrink-0" /> {/* Send button */}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ChatLoading() {
  return (
    <div className="relative mx-auto h-dvh flex min-w-full flex-1 flex-col gap-4 p-4 pb-0">
      {/* Main conversation area */}
      <Conversation>
        <ConversationContent className="pb-32">
          {/* Sample skeleton messages - realistic conversation flow */}
          <MessageSkeleton isUser={true} />
          <MessageSkeleton isUser={false} />
          <MessageSkeleton isUser={true} />
          <MessageSkeleton isUser={false} />
          
          {/* Optional: Loading indicator for ongoing message (when chat is actively loading) */}
          <div className="group flex w-full items-end justify-end gap-2 py-4 is-assistant flex-row-reverse justify-end opacity-80">
            <div className="flex flex-col w-auto max-w-full">
              <div className="flex items-start gap-3">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex items-center gap-2 py-4">
                  <span className="h-2 w-2 rounded-full bg-foreground/70 animate-bounce [animation-delay:-0.2s]" />
                  <span className="h-2 w-2 rounded-full bg-foreground/70 animate-bounce [animation-delay:-0.1s]" />
                  <span className="h-2 w-2 rounded-full bg-foreground/70 animate-bounce" />
                </div>
              </div>
            </div>
          </div>
        </ConversationContent>
      </Conversation>

      {/* Chat input skeleton */}
      <ChatInputSkeleton />
    </div>
  )
}
