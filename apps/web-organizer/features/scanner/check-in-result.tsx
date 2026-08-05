import { AlertTriangle, Check, X } from 'lucide-react';

import { Card } from '@tickethub/ui';

import { type CheckInResult } from './api';

const outcomes = {
  valid: {
    Icon: Check,
    tone: 'border-success/40 bg-success/10 text-success',
    title: 'Checked in',
  },
  used: {
    Icon: AlertTriangle,
    tone: 'border-warn/40 bg-warn/10 text-warn',
    title: 'Already used',
  },
  invalid: {
    Icon: X,
    tone: 'border-danger/40 bg-danger/10 text-danger',
    title: 'Invalid ticket',
  },
  // A real ticket at the wrong door — another organizer's show, or another of this organizer's.
  // Worth its own wording: "Invalid ticket" would send an attendant hunting for a forgery that does
  // not exist, when the holder just needs directions.
  wrongShow: {
    Icon: AlertTriangle,
    tone: 'border-warn/40 bg-warn/10 text-warn',
    title: 'Wrong show',
  },
} as const satisfies Record<CheckInResult['result'], unknown>;

const checkedInAt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

export function CheckInPanel({ result }: { result: CheckInResult }) {
  const { Icon, tone, title } = outcomes[result.result];

  return (
    <Card padding="lg" radius="panel" className={`border ${tone}`} asChild>
      <div role="status" aria-live="polite">
        <div className="mb-3 flex items-center gap-3">
          <Icon aria-hidden className="size-6" />
          <p className="font-display text-lg font-semibold">{title}</p>
        </div>

        {/* Seat only — the show is named by the picker at the top of the screen, and repeating it
            here cost two RPCs a scan to re-send a constant. */}
        {result.seatLabel ? (
          <p className="text-sm text-fg-secondary">Seat {result.seatLabel}</p>
        ) : null}

        {result.result === 'used' && result.checkedInAt ? (
          <p className="mt-1 font-mono text-xs text-fg-muted">
            Scanned at {checkedInAt.format(new Date(result.checkedInAt))}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
