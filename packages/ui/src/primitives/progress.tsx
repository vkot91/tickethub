'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '../lib/cn';

interface ProgressProps {
  value: number;
  max: number;
  className?: string;
  indicatorClassName?: string;
  label?: string;
}

/** Radix Progress — the `progressbar` role and its aria value attributes come for free.
 *  Used for the sold bar in the shows table and the dashboard, and the hold timer. */
export function Progress({ value, max, className, indicatorClassName, label }: ProgressProps) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  return (
    <ProgressPrimitive.Root
      value={value}
      max={max}
      aria-label={label}
      className={cn('h-[3px] w-15 overflow-hidden rounded-pill bg-white/8', className)}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full bg-accent transition-[width]', indicatorClassName)}
        style={{ width: `${percent}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
