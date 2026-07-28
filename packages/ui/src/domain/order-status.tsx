import { type OrderResponse } from '@tickethub/contracts';

import { StatusPill, type Tone } from '../primitives/status-pill';

type OrderStatus = OrderResponse['status'];

const tones = {
  awaiting_payment: { tone: 'accent', label: 'Awaiting payment' },
  paid: { tone: 'success', label: 'Paid' },
  expired: { tone: 'warn', label: 'Expired' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
  refunded: { tone: 'neutral', label: 'Refunded' },
} as const satisfies Record<OrderStatus, { tone: Tone; label: string }>;

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const { tone, label } = tones[status];

  return <StatusPill tone={tone}>{label}</StatusPill>;
}
