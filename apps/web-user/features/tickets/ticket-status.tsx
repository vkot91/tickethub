import { StatusPill, type Tone } from '@tickethub/ui';

import { type Ticket } from './api';

const tones = {
  active: { tone: 'success', label: 'ACTIVE' },
  checked_in: { tone: 'neutral', label: 'CHECKED IN' },
  void: { tone: 'danger', label: 'VOID' },
} as const satisfies Record<Ticket['status'], { tone: Tone; label: string }>;

export function TicketStatusPill({ status }: { status: Ticket['status'] }) {
  const { tone, label } = tones[status];

  return <StatusPill tone={tone}>{label}</StatusPill>;
}
