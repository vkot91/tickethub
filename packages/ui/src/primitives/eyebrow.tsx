import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/** Mono, letter-spaced, uppercase micro-label — the design uses it above every heading. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'font-mono text-[11px] font-medium tracking-[0.12em] text-accent uppercase',
        className,
      )}
      {...props}
    />
  );
}
