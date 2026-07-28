'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { ReactNode } from 'react';

import { buttonVariants } from '../primitives/button';
import { cn } from '../lib/cn';

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
}

/** Radix AlertDialog — focus trap, escape handling and the alertdialog role come for free.
 *  Used for anything that spends or refunds money. */
export function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Keep it',
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>

      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-90 bg-page/70 backdrop-blur-sm" />

        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-100 w-[min(440px,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-line bg-surface p-6">
          <AlertDialog.Title className="mb-2 font-display text-lg font-semibold">
            {title}
          </AlertDialog.Title>

          <AlertDialog.Description className="mb-6 text-sm text-fg-muted">
            {body}
          </AlertDialog.Description>

          <div className="flex justify-end gap-3">
            <AlertDialog.Cancel
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
            >
              {cancelLabel}
            </AlertDialog.Cancel>

            <AlertDialog.Action
              disabled={isPending}
              onClick={onConfirm}
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              {isPending ? 'Working…' : confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
