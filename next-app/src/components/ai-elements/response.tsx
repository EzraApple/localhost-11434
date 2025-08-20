'use client';

import { cn } from '~/lib/utils';
import { type ComponentProps, memo, useEffect, useState } from 'react';
import { Streamdown } from 'streamdown';

type ResponseProps = ComponentProps<typeof Streamdown> & { isWaiting?: boolean };

export const Response = memo(
  ({ className, isWaiting = false, children, ...props }: ResponseProps) => {
    const [dots, setDots] = useState(0)
    useEffect(() => {
      if (!isWaiting) return
      const t = setInterval(() => setDots(d => (d + 1) % 4), 400)
      return () => clearInterval(t)
    }, [isWaiting])
    if (isWaiting) {
      return (
        <div className={cn('text-sm text-neutral-400', className)} {...(props as any)}>
          {'.'.repeat(dots).padEnd(3, '·')}
        </div>
      )
    }
    return (
      <Streamdown
        className={cn(
          'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          className
        )}
        {...props}
      >
        {children}
      </Streamdown>
    )
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = 'Response';
