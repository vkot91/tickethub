import Link from 'next/link';

import { Button, Card, formatPrice, formatShowDateTime, OrderStatusPill } from '@tickethub/ui';

import { type OrderListItem } from './api';
import { RefundButton } from './refund-button';

export function OrderCard({ order }: { order: OrderListItem }) {
  return (
    <Card padding="lg" asChild>
      <article className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-semibold">{order.showTitle}</h2>
            <OrderStatusPill status={order.status} />
          </div>

          <p className="mb-3 font-mono text-xs text-fg-faint">
            {formatShowDateTime(order.createdAt)} · {order.id.slice(0, 8)}
          </p>

          {order.seatLabels.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {order.seatLabels.map((label) => (
                <li
                  key={label}
                  className="rounded-pill border border-line px-2.5 py-1 font-mono text-[11px] text-fg-secondary"
                >
                  {label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-3">
          <p className="font-display text-xl font-semibold">{formatPrice(order.totalCents)}</p>

          {order.status === 'awaiting_payment' ? (
            <Button asChild size="sm">
              <Link href={`/orders/${order.id}/checkout`}>Pay now →</Link>
            </Button>
          ) : null}

          {order.status === 'paid' ? (
            <RefundButton orderId={order.id} totalCents={order.totalCents} />
          ) : null}
        </div>
      </article>
    </Card>
  );
}
