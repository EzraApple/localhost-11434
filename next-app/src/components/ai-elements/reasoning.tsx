'use client';

import { useControllableState } from '@radix-ui/react-use-controllable-state';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { cn } from '~/lib/utils';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { createContext, memo, useContext, useEffect, useState } from 'react';
import { Response } from './response';
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from './tool';
import type { ToolCall } from '~/lib/tools/types';
import type { ReasoningEvent } from '~/hooks/use-ollama-chat/display-state-manager';

type ReasoningContextValue = {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen = false,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange,
    });
    const [duration, setDuration] = useControllableState({
      prop: durationProp,
      defaultProp: 0,
    });

    const [hasAutoClosedRef, setHasAutoClosedRef] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);

    // Track duration when streaming starts and ends
    useEffect(() => {
      if (isStreaming) {
        if (startTime === null) {
          setStartTime(Date.now());
        }
      } else if (startTime !== null) {
        setDuration(Math.round((Date.now() - startTime) / 1000));
        setStartTime(null);
      }
    }, [isStreaming, startTime, setDuration]);

    // Auto-open when streaming starts, auto-close when streaming ends (once only)
    useEffect(() => {
      if (isStreaming && !isOpen) {
        setIsOpen(true);
      } else if (!isStreaming && isOpen && !defaultOpen && !hasAutoClosedRef) {
        // Add a small delay before closing to allow user to see the content
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosedRef(true);
        }, AUTO_CLOSE_DELAY);
        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, defaultOpen, setIsOpen, hasAutoClosedRef]);

    const handleOpenChange = (newOpen: boolean) => {
      setIsOpen(newOpen);
    };

    return (
      <ReasoningContext.Provider
        value={{ isStreaming, isOpen, setIsOpen, duration }}
      >
        <Collapsible
          className={cn('not-prose mb-4', className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  }
);

export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  title?: string;
};

export const ReasoningTrigger = memo(
  ({
    className,
    title = 'Reasoning',
    children,
    ...props
  }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration } = useReasoning();

    return (
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-2 text-muted-foreground text-sm',
          className
        )}
        {...props}
      >
        {children ?? (
          <>
            <BrainIcon className="size-4" />
            {isStreaming || duration === 0 ? (
              <p className="bg-gradient-to-r from-neutral-400 via-neutral-200 to-neutral-400 bg-clip-text text-transparent [background-size:200%_100%] animate-[shimmer_1.5s_linear_infinite]">
                Thinking...
              </p>
            ) : (
              <p>Thought for {duration} seconds</p>
            )}
            <ChevronDownIcon
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                isOpen ? 'rotate-180' : 'rotate-0'
              )}
            />
          </>
        )}
      </CollapsibleTrigger>
    );
  }
);

export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  children: string;
  toolCalls?: ToolCall[];
  reasoningTimeline?: ReasoningEvent[];
};

export const ReasoningContent = memo(
  ({ className, children, toolCalls, reasoningTimeline, ...props }: ReasoningContentProps) => {
    // If we have a timeline, use it for inline rendering, otherwise fall back to legacy behavior
    const useTimeline = reasoningTimeline && reasoningTimeline.length > 0;
    
    return (
      <CollapsibleContent
        className={cn(
          'mt-4 text-sm',
          'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in',
          className
        )}
        {...props}
      >
        <div className="grid gap-2">
          {useTimeline ? (
            // Render timeline with inline tool calls - group text chunks together
            <>
              {(() => {
                const groupedElements: React.ReactNode[] = [];
                let currentTextChunks: string[] = [];
                let textChunkIndex = 0;

                const flushTextChunks = () => {
                  if (currentTextChunks.length > 0) {
                    groupedElements.push(
                      <Response key={`text-group-${textChunkIndex++}`}>
                        {currentTextChunks.join('')}
                      </Response>
                    );
                    currentTextChunks = [];
                  }
                };

                reasoningTimeline.forEach((event, index) => {
                  if (event.type === 'text') {
                    currentTextChunks.push(event.content || '');
                  } else if (event.type === 'tool_call' && event.toolCall) {
                    // Flush any accumulated text before the tool call
                    flushTextChunks();
                    
                    // Add the tool call with proper spacing
                    groupedElements.push(
                      <div key={`tool-wrapper-${event.toolCall.id}-${index}`} className="mt-2">
                        <Tool className="bg-muted/30">
                          <ToolHeader 
                            type={event.toolCall.name} 
                            state={event.toolCall.state}
                          />
                          <ToolContent>
                            <ToolInput input={event.toolCall.arguments} />
                            {(event.toolCall.result !== undefined || event.toolCall.error) && (
                              <ToolOutput 
                                output={event.toolCall.result} 
                                errorText={event.toolCall.error} 
                              />
                            )}
                          </ToolContent>
                        </Tool>
                      </div>
                    );
                  }
                });

                // Flush any remaining text chunks
                flushTextChunks();

                return groupedElements;
              })()}
            </>
          ) : (
            // Legacy behavior - render text first, then tool calls
            <>
              <Response>{children}</Response>
              
              {/* Render tool calls that happened during reasoning (legacy) */}
              {toolCalls && toolCalls.length > 0 && (
                <div className="space-y-2 mt-2">
                  {toolCalls.map((toolCall) => (
                    <Tool key={toolCall.id} className="bg-muted/30">
                      <ToolHeader 
                        type={toolCall.name} 
                        state={toolCall.state}
                      />
                      <ToolContent>
                        <ToolInput input={toolCall.arguments} />
                        {(toolCall.result !== undefined || toolCall.error) && (
                          <ToolOutput 
                            output={toolCall.result} 
                            errorText={toolCall.error} 
                          />
                        )}
                      </ToolContent>
                    </Tool>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    );
  }
);

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
