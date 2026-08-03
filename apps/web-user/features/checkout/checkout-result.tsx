import { Check, Clock, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';

import { type OrderResponse } from '@tickethub/contracts';
import { Button, Card, formatPrice } from '@tickethub/ui';

import { type SettledStatus } from '@/features/orders/api';

const results = {
  paid: {
    Icon: Check,
    tone: 'text-success',
    ring: 'border-success/40 bg-success/15',
    title: 'Payment confirmed',
    body: 'Your tickets are being generated and will arrive by email as a PDF with a QR code.',
    action: { href: '/tickets', label: 'View my tickets →' },
  },
  expired: {
    Icon: Clock,
    tone: 'text-warn',
    ring: 'border-warn/40 bg-warn/15',
    title: 'Your seats were released',
    body: 'The ten-minute hold ran out before the payment went through. Nothing was charged.',
    action: { href: '/', label: 'Back to catalog' },
  },
  cancelled: {
    Icon: X,
    tone: 'text-danger',
    ring: 'border-danger/40 bg-danger/15',
    title: 'Order cancelled',
    body: 'This order is no longer active. Nothing was charged.',
    action: { href: '/', label: 'Back to catalog' },
  },
  refunded: {
    Icon: RotateCcw,
    tone: 'text-fg-muted',
    ring: 'border-line bg-white/5',
    title: 'Order refunded',
    body: 'This order was refunded. The money is on its way back to your card.',
    action: { href: '/orders', label: 'My orders' },
  },
} as const satisfies Record<SettledStatus, unknown>;

export function CheckoutResult({ order }: { order: OrderResponse & { status: SettledStatus } }) {
  const { Icon, tone, ring, title, body, action } = results[order.status];

  return (
    <Card radius="panel" padding="lg" className="mx-auto max-w-130 text-center">
      <span
        className={`mx-auto mb-5 flex size-14 items-center justify-center rounded-pill border ${ring}`}
      >
        <Icon aria-hidden className={`size-6 ${tone}`} />
      </span>

      <h1 className="mb-2 font-display text-2xl font-semibold">{title}</h1>
      <p className="mb-6 text-sm text-fg-muted">{body}</p>

      <dl className="mb-7 flex justify-center gap-8 font-mono text-xs">
        <div>
          <dt className="text-fg-faint">ORDER</dt>
          <dd className="text-fg-secondary">{order.id.slice(0, 8)}</dd>
        </div>
        <div>
          <dt className="text-fg-faint">AMOUNT</dt>
          <dd className="text-fg-secondary">{formatPrice(order.totalCents)}</dd>
        </div>
      </dl>

      <Button asChild>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    </Card>
  );
}
