'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'font-mono text-[10px] font-medium tracking-[0.1em] text-fg-faint uppercase',
        className,
      )}
      {...props}
    />
  );
}
