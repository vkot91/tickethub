'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import { useEffect, useState } from 'react';

import { Card, cn } from '@tickethub/ui';

import { formatCountdown, isUrgent, msLeft, progressPercent } from './timer';

/** Ticks once a second off the order's own `expiresAt`. The server still owns expiry —
 *  reaching zero here only tells the UI to stop asking for money. */
export function HoldTimer({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [remainingMs, setRemainingMs] = useState(() => msLeft(expiresAt, Date.now()));

  useEffect(() => {
    const tick = () => setRemainingMs(msLeft(expiresAt, Date.now()));

    tick();

    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  useEffect(() => {
    if (remainingMs === 0) onExpire();
  }, [remainingMs, onExpire]);

  const urgent = isUrgent(remainingMs);
  const percent = progressPercent(remainingMs);

  return (
    <Card className="mb-6">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-[0.1em] text-fg-faint uppercase">
          Seats held for
        </span>
        <span
          role="timer"
          aria-live="off"
          className={cn('font-mono text-lg', urgent ? 'text-danger' : 'text-fg')}
        >
          {formatCountdown(remainingMs)}
        </span>
      </div>

      <ProgressPrimitive.Root
        value={percent}
        className="h-1.5 overflow-hidden rounded-pill bg-white/5"
      >
        <ProgressPrimitive.Indicator
          style={{ width: `${percent}%` }}
          className={cn(
            'h-full transition-[width] duration-1000 ease-linear',
            urgent ? 'bg-danger' : 'bg-accent',
          )}
        />
      </ProgressPrimitive.Root>
    </Card>
  );
}
