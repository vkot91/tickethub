'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { type ComponentPropsWithoutRef } from 'react';

import { cn } from '../lib/cn';

/** Radix Dialog — focus trap, escape and the `dialog` role come for free. This is the form
 *  dialog; `ConfirmDialog` stays on AlertDialog, which is announced as an alert and whose
 *  content slot is a message rather than a form. */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-90 bg-page/70 backdrop-blur-sm" />

      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-100 w-[min(520px,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-line bg-surface p-6',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-display text-lg font-semibold', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-fg-muted', className)} {...props} />
  );
}
