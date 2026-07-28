import { type OrderResponse } from '@tickethub/contracts';

import { Card, formatPrice } from '@tickethub/ui';

/**
 * `GET /orders/:id` returns totals only — no seat lines (BACKEND-GAPS.md §4). The design's
 * per-seat rows and 8% service-fee split land when the endpoint carries them; until then the
 * summary shows the one number that is authoritative, which is the one being charged.
 */
export function OrderSummary({ order }: { order: OrderResponse }) {
  return (
    <Card padding="lg" asChild>
      <aside aria-labelledby="order-summary-heading">
        <h2 id="order-summary-heading" className="mb-5 font-display text-lg font-semibold">
          Order summary
        </h2>

        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Order</dt>
            <dd className="font-mono text-xs text-fg-secondary">{order.id.slice(0, 8)}</dd>
          </div>

          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <dt className="text-fg-muted">Total</dt>
            <dd className="font-display text-xl font-semibold">
              {formatPrice(order.totalCents)}
              <span className="ml-2 font-mono text-[11px] text-fg-faint uppercase">
                {order.currency}
              </span>
            </dd>
          </div>
        </dl>
      </aside>
    </Card>
  );
}
