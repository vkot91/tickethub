import { type ShowSummary } from '@tickethub/contracts';

import { StatusPill, type Tone } from '../primitives/status-pill';

type ShowStatus = ShowSummary['status'];

const tones = {
  published: { tone: 'success', label: 'On sale' },
  draft: { tone: 'neutral', label: 'Draft' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
  finished: { tone: 'neutral', label: 'Finished' },
} as const satisfies Record<ShowStatus, { tone: Tone; label: string }>;

export function ShowStatusPill({ status }: { status: ShowStatus }) {
  const { tone, label } = tones[status];

  return <StatusPill tone={tone}>{label}</StatusPill>;
}
