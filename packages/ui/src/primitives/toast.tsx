'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

export const ToastProvider = ToastPrimitive.Provider;

const toastVariants = cva(
  'flex items-start gap-3 rounded-control border p-4 shadow-lg backdrop-blur-xl data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-surface/95 text-fg',
        success: 'border-success/40 bg-surface/95 text-fg',
        warn: 'border-warn/40 bg-surface/95 text-fg',
        danger: 'border-danger/40 bg-surface/95 text-fg',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        'fixed top-20 right-6 z-100 flex w-[min(380px,calc(100vw-3rem))] flex-col gap-2 outline-none',
        className,
      )}
      {...props}
    />
  );
}

export interface ToastProps
  extends ComponentProps<typeof ToastPrimitive.Root>, VariantProps<typeof toastVariants> {
  title: string;
  body?: string;
}

export function Toast({ className, tone, title, body, ...props }: ToastProps) {
  return (
    <ToastPrimitive.Root className={cn(toastVariants({ tone }), className)} {...props}>
      <div className="flex-1">
        <ToastPrimitive.Title className="font-display text-sm font-semibold">
          {title}
        </ToastPrimitive.Title>
        {body ? (
          <ToastPrimitive.Description className="mt-1 text-[13px] text-fg-muted">
            {body}
          </ToastPrimitive.Description>
        ) : null}
      </div>
      <ToastPrimitive.Close aria-label="Dismiss" className="text-fg-faint hover:text-fg">
        ✕
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
