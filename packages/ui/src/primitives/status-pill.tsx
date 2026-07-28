import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/** The design's pill in every tone it appears in: catalog status, order status, check-in result. */
const statusPillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-pill border px-2 py-1 font-mono text-[10px] font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        success: 'border-success/35 bg-success/15 text-success',
        warn: 'border-warn/35 bg-warn/15 text-warn',
        danger: 'border-danger/35 bg-danger/15 text-danger',
        accent: 'border-accent/35 bg-accent/15 text-accent',
        neutral: 'border-line bg-white/5 text-fg-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

/** The tones a pill can take, so a feature's status→tone map cannot drift from the variants. */
export type Tone = NonNullable<VariantProps<typeof statusPillVariants>['tone']>;

export interface StatusPillProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusPillVariants> {}

export function StatusPill({ className, tone, ...props }: StatusPillProps) {
  return <span className={cn(statusPillVariants({ tone }), className)} {...props} />;
}
