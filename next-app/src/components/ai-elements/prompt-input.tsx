'use client';

import { Button } from '~/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';
import type { ChatStatus } from 'ai';
import { Loader2Icon, ArrowUp, SquareIcon, XIcon, Paperclip } from 'lucide-react';
import type {
  ComponentProps,
  HTMLAttributes,
  KeyboardEventHandler,
} from 'react';
import { Children } from 'react';
import type { FileUploadItem } from '~/lib/file-upload';

export type PromptInputProps = HTMLAttributes<HTMLFormElement>;

export const PromptInput = ({ className, ...props }: PromptInputProps) => (
  <form
    className={cn(
      'w-full divide-y overflow-hidden rounded-xl border bg-background shadow-sm',
      className
    )}
    {...props}
  />
);

export type PromptInputTextareaProps = ComponentProps<typeof Textarea> & {
  minHeight?: number;
  maxHeight?: number;
};

export const PromptInputTextarea = ({
  onChange,
  className,
  placeholder = 'What would you like to know?',
  minHeight = 48,
  maxHeight = 164,
  ...props
}: PromptInputTextareaProps) => {
  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter') {
      // Don't submit if IME composition is in progress
      if (e.nativeEvent.isComposing) {
        return;
      }

      if (e.shiftKey) {
        // Allow newline
        return;
      }

      // Submit on Enter (without Shift)
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  return (
    <Textarea
      className={cn(
        'w-full resize-none rounded-none border-none p-3 shadow-none outline-none ring-0',
        'field-sizing-content max-h-[6lh] bg-transparent dark:bg-transparent',
        'focus-visible:ring-0',
        className
      )}
      name="message"
      onChange={(e) => {
        onChange?.(e);
      }}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
    />
  );
};

export type PromptInputToolbarProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputToolbar = ({
  className,
  ...props
}: PromptInputToolbarProps) => (
  <div
    className={cn('flex items-center justify-between p-1', className)}
    {...props}
  />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({
  className,
  ...props
}: PromptInputToolsProps) => (
  <div
    className={cn(
      'flex items-center gap-1',
      '[&_button:first-child]:rounded-bl-xl',
      className
    )}
    {...props}
  />
);

export type PromptInputButtonProps = ComponentProps<typeof Button>;

export const PromptInputButton = ({
  variant = 'ghost',
  className,
  size,
  ...props
}: PromptInputButtonProps) => {
  const newSize =
    (size ?? Children.count(props.children) > 1) ? 'default' : 'icon';

  return (
    <Button
      className={cn(
        'shrink-0 gap-1.5 rounded-lg',
        variant === 'ghost' && 'text-muted-foreground',
        newSize === 'default' && 'px-3',
        className
      )}
      size={newSize}
      type="button"
      variant={variant}
      {...props}
    />
  );
};

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: ChatStatus;
};

export const PromptInputSubmit = ({
  className,
  variant = 'default',
  size = 'icon',
  status,
  children,
  ...props
}: PromptInputSubmitProps) => {
  let Icon = <ArrowUp className="size-4" />;

  if (status === 'submitted') {
    Icon = <Loader2Icon className="size-4 animate-spin" />;
  } else if (status === 'streaming') {
    Icon = <SquareIcon className="size-4" />;
  } else if (status === 'error') {
    Icon = <XIcon className="size-4" />;
  }

  return (
    <Button
      className={cn('gap-1.5 rounded-lg', className)}
      size={size}
      type="submit"
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </Button>
  );
};

export type PromptInputModelSelectProps = ComponentProps<typeof Select>;

export const PromptInputModelSelect = (props: PromptInputModelSelectProps) => (
  <Select {...props} />
);

export type PromptInputModelSelectTriggerProps = ComponentProps<
  typeof SelectTrigger
>;

export const PromptInputModelSelectTrigger = ({
  className,
  ...props
}: PromptInputModelSelectTriggerProps) => (
  <SelectTrigger
    className={cn(
      'border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors',
      'hover:bg-accent hover:text-foreground [&[aria-expanded="true"]]:bg-accent [&[aria-expanded="true"]]:text-foreground',
      className
    )}
    {...props}
  />
);

export type PromptInputModelSelectContentProps = ComponentProps<
  typeof SelectContent
>;

export const PromptInputModelSelectContent = ({
  className,
  ...props
}: PromptInputModelSelectContentProps) => (
  <SelectContent className={cn(className)} {...props} />
);

export type PromptInputModelSelectItemProps = ComponentProps<typeof SelectItem>;

export const PromptInputModelSelectItem = ({
  className,
  ...props
}: PromptInputModelSelectItemProps) => (
  <SelectItem className={cn(className)} {...props} />
);

export type PromptInputModelSelectValueProps = ComponentProps<
  typeof SelectValue
>;

export const PromptInputModelSelectValue = ({
  className,
  ...props
}: PromptInputModelSelectValueProps) => (
  <SelectValue className={cn(className)} {...props} />
);

export type PromptInputFileUploadProps = ComponentProps<typeof Button> & {
  onFilesSelected?: (files: FileUploadItem[]) => void;
  disabled?: boolean;
  accept?: string;
  maxFiles?: number;
  supportedTypes?: string;
  tooltip?: string;
};

export const PromptInputFileUpload = ({
  className,
  onFilesSelected,
  disabled = false,
  accept = "*",
  maxFiles = 10,
  supportedTypes = "",
  tooltip = "Upload files",
  ...props
}: PromptInputFileUploadProps) => {
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || disabled) return;

    const fileArray = Array.from(files).slice(0, maxFiles);
    
    try {
      const { parseFile, validateFile, getFileType } = await import('~/lib/file-upload');
      
      const parsedFiles = await Promise.all(
        fileArray.map(async (file) => {
          const fileType = getFileType(file);
          if (!fileType) {
            throw new Error(`Unsupported file type: ${file.name}`);
          }
          
          return await parseFile(file, fileType);
        })
      );

      onFilesSelected?.(parsedFiles);
    } catch (error) {
      console.error('File upload error:', error);
      // Could add toast notification here
    }
  };

  const handleClick = () => {
    if (disabled) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = maxFiles > 1;
    if (accept !== "*") {
      input.accept = accept;
    }
    input.onchange = (e) => handleFileSelect((e.target as HTMLInputElement).files);
    input.click();
  };

  return (
    <Button
      className={cn(
        'shrink-0 gap-1.5 rounded-lg',
        'text-muted-foreground hover:text-foreground',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      size="icon"
      type="button"
      variant="ghost"
      onClick={handleClick}
      disabled={disabled}
      title={tooltip}
      {...props}
    >
      <Paperclip className="size-4" />
    </Button>
  );
};

// Legacy export for backward compatibility
export const PromptInputImageUpload = PromptInputFileUpload;
