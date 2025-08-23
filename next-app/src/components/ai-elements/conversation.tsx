'use client';

import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { ArrowDownIcon } from 'lucide-react';
import type { ReactNode, ComponentProps } from 'react';
import { useCallback } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

export type ConversationProps = {
  className?: string;
  children?: ReactNode;
};

export const Conversation = ({ className, children }: ConversationProps) => {
  return (
    <div className={cn('relative flex-1 min-h-0 w-full', className)}>
      <StickToBottom
        className={cn(
          'absolute inset-0 overflow-y-auto',
          // Custom scrollbar styling for dark theme using webkit-scrollbar
          '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#2b3f3e] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[#3a514f]'
        )}
        initial="instant" // Use instant instead of smooth to avoid flying effect
        resize="smooth"
        role="log"
      >
        {children}
      </StickToBottom>
    </div>
  );
};

export type ConversationContentProps = {
  className?: string;
  children?: ReactNode;
};

export const ConversationContent = ({
  className,
  children
}: ConversationContentProps) => (
  <StickToBottom.Content className={cn('p-4 max-w-4xl w-full mx-auto relative', className)}>
    {children}
  </StickToBottom.Content>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full',
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};
