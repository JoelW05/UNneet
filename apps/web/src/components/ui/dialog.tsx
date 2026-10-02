'use client';

import { X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

/**
 * A modal dialog on Radix: focus is trapped and restored, Escape closes it, the page behind is
 * inert for screen readers, and the title/description are wired up for assistive tech.
 */
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  side = 'center',
  ...props
}: Omit<ComponentProps<typeof RadixDialog.Content>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  side?: 'center' | 'bottom';
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <RadixDialog.Content
        className={cn(
          'fixed z-50 grid max-h-[92dvh] gap-4 overflow-y-auto border border-line bg-surface p-5 shadow-lift sm:p-6',
          side === 'center'
            ? 'left-1/2 top-1/2 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-card'
            : 'inset-x-0 bottom-0 rounded-t-card sm:inset-x-auto sm:right-0 sm:top-0 sm:h-dvh sm:max-h-none sm:w-[26rem] sm:rounded-none',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <RadixDialog.Title className="text-xl font-bold">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-ink-2">
                {description}
              </RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Close" className="-mr-2 -mt-1 shrink-0">
              <X aria-hidden className="size-5" />
            </Button>
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
