import { Card, formatPrice, OrderStatusPill } from '@tickethub/ui';

import { type RecentOrder } from '../api';

/**
 * ponytail: a plain table. Six static columns, no sorting, filtering or virtualisation —
 * TanStack Table earns its keep when any of those arrive, not before.
 */
export function RecentOrdersTable({ orders }: { orders: RecentOrder[] }) {
  return (
    <Card padding="lg" asChild>
      <section aria-labelledby="recent-orders-heading">
        <h2 id="recent-orders-heading" className="mb-5 font-display text-lg font-semibold">
          Recent orders
        </h2>

        {orders.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing sold yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-140 text-left text-sm">
              <thead>
                <tr className="font-mono text-[10px] tracking-[0.1em] text-fg-faint uppercase">
                  <th scope="col" className="pb-3 font-medium">
                    Order
                  </th>
                  <th scope="col" className="pb-3 font-medium">
                    Show
                  </th>
                  <th scope="col" className="pb-3 font-medium">
                    Buyer
                  </th>
                  <th scope="col" className="pb-3 font-medium">
                    Seats
                  </th>
                  <th scope="col" className="pb-3 text-right font-medium">
                    Amount
                  </th>
                  <th scope="col" className="pb-3 text-right font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-line">
                    <td className="py-3 font-mono text-xs text-fg-secondary">
                      {order.id.slice(0, 8)}
                    </td>
                    <td className="py-3 pr-4">{order.showTitle}</td>
                    <td className="py-3 pr-4 text-fg-muted">{order.buyerEmail}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-fg-secondary">
                      {order.seatLabels.join(', ')}
                    </td>
                    <td className="py-3 text-right font-mono text-xs">
                      {formatPrice(order.totalCents)}
                    </td>
                    <td className="py-3 text-right">
                      <OrderStatusPill status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Card>
  );
}
