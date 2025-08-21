import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '~/components/ui/avatar';
import { cn } from '~/lib/utils';
import type { UIMessage } from 'ai';
import type { ComponentProps, HTMLAttributes } from 'react';
import { MessageActions } from './message-actions';
import { MessageEdit } from './message-edit';
import type { UIMessage as LocalUIMessage } from '~/lib/chat-types';

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage['role'];
  message?: LocalUIMessage;
  isEditing?: boolean;
  onEdit?: (messageId: string) => void;
  onRetry?: (messageId: string, model?: string) => void;
  onEditSave?: (messageId: string, newText: string) => void;
  onEditCancel?: () => void;
};

export const Message = ({ 
  className, 
  from, 
  message, 
  isEditing, 
  onEdit, 
  onRetry, 
  onEditSave, 
  onEditCancel, 
  children,
  ...props 
}: MessageProps) => (
  <div
    className={cn(
      'group flex w-full items-end justify-end gap-2 py-4',
      from === 'user' ? 'is-user' : 'is-assistant flex-row-reverse justify-end',
      // Only constrain width when not editing to maintain content-fitting behavior
      !isEditing && '[&>div]:max-w-[88%] group-[.is-assistant]:[&>div]:max-w-full group-[.is-assistant]:[&>div]:w-full',
      className
    )}
    {...props}
  >
    <div className={cn(
      'flex flex-col',
      isEditing ? 'w-full' : 'w-auto' // Full width when editing, auto when not
    )}>
      {children}
      {/* Reserve space for actions - always present but only visible on hover */}
      <div className="h-8 flex items-center justify-start pl-1">
        {message && (
          <MessageActions
            message={message}
            isEditing={isEditing}
            onEdit={onEdit}
            onRetry={onRetry}
            onEditCancel={onEditCancel}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          />
        )}
      </div>
    </div>
  </div>
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement> & {
  message?: LocalUIMessage;
  isEditing?: boolean;
  onEditSave?: (messageId: string, newText: string) => void;
  onEditCancel?: () => void;
};

export const MessageContent = ({
  children,
  className,
  message,
  isEditing,
  onEditSave,
  onEditCancel,
  ...props
}: MessageContentProps) => {
  if (isEditing && message && onEditSave && onEditCancel) {
    const textContent = message.parts
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n');

    return (
      <div
        className={cn(
          'flex flex-col gap-2 overflow-hidden rounded-lg px-4 py-3 text-foreground text-sm',
          'group-[.is-user]:bg-[#0a1918] group-[.is-user]:text-[#e5e9e8] group-[.is-user]:border group-[.is-user]:border-[#2b3f3e]/70',
          'group-[.is-user]:shadow-[0_4px_16px_rgb(0,0,0,0.1),0_2px_8px_rgb(0,0,0,0.06),inset_0_1px_2px_rgb(255,255,255,0.05)]',
          'group-[.is-user]:ring-1 group-[.is-user]:ring-[#2b3f3e]/30',
          'group-[.is-assistant]:w-full group-[.is-assistant]:bg-background group-[.is-assistant]:text-foreground group-[.is-assistant]:backdrop-blur-0 group-[.is-assistant]:border-0 group-[.is-assistant]:overflow-visible',
          className
        )}
        {...props}
      >
        <MessageEdit
          initialText={textContent}
          onSave={(newText) => onEditSave(message.id, newText)}
          onCancel={onEditCancel}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 overflow-hidden rounded-lg px-4 py-3 text-foreground text-sm',
        'group-[.is-user]:bg-[#132827cc] group-[.is-user]:text-[#e5e9e8] group-[.is-user]:border group-[.is-user]:border-[#2b3f3e]/50',
        'group-[.is-assistant]:w-full group-[.is-assistant]:bg-background group-[.is-assistant]:text-foreground group-[.is-assistant]:backdrop-blur-0 group-[.is-assistant]:border-0 group-[.is-assistant]:overflow-visible',
        className
      )}
      {...props}
    >
      <div className="is-user:dark">{children}</div>
    </div>
  );
};

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src: string;
  name?: string;
};

export const MessageAvatar = ({
  src,
  name,
  className,
  ...props
}: MessageAvatarProps) => (
  <Avatar
    className={cn('size-8 ring ring-1 ring-border', className)}
    {...props}
  >
    <AvatarImage alt="" className="mt-0 mb-0" src={src} />
    <AvatarFallback>{name?.slice(0, 2) || 'ME'}</AvatarFallback>
  </Avatar>
);
