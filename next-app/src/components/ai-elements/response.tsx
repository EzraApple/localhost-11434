'use client';

import { cn } from '~/lib/utils';
import { type ComponentProps, memo, useEffect, useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';
import type { Components } from 'react-markdown';
import { CodeBlock } from '~/components/ai-elements/code-block';

type ResponseProps = ComponentProps<typeof Streamdown> & { isWaiting?: boolean };

export const Response = memo(
  ({ className, isWaiting = false, children, components: userComponents, ...props }: ResponseProps & { components?: Components }) => {
    const [dots, setDots] = useState(0)
    useEffect(() => {
      if (!isWaiting) return
      const t = setInterval(() => setDots(d => (d + 1) % 4), 400)
      return () => clearInterval(t)
    }, [isWaiting])
    const components = useMemo<Components>(() => ({
      code({ inline, className, children, ...codeProps }) {
        const languageMatch = /language-(\w+)/.exec(className ?? '')
        const codeString = String(children ?? '')
        if (!inline && languageMatch) {
          return (
            <CodeBlock
              code={codeString}
              language={languageMatch[1] as string}
              showLineNumbers={false}
            />
          )
        }
        return (
          <code
            className={cn(
              'rounded-md bg-[#0f2523]/60 px-1.5 py-0.5 text-[#d6dbd9] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
              className
            )}
            {...codeProps as any}
          >
            {children}
          </code>
        )
      },
      hr(props) {
        return (
          <hr
            className={cn('my-6 h-[3px] w-full rounded-full bg-[#0b3f3a]/60', (props as any).className)}
            {...(props as any)}
          />
        )
      },
      pre({ children }) {
        return <div className="my-3">{children}</div>
      },
      ...(userComponents ?? {}),
    }), [userComponents])
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
        components={components}
        {...props}
      >
        {children}
      </Streamdown>
    )
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = 'Response';
