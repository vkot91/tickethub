import { type ShowStats } from '@tickethub/contracts';
import { Card, cn, formatPrice } from '@tickethub/ui';

/**
 * Four numbers, and no delta line: the contract carries no comparable previous range, and §J says
 * to omit the line rather than fake one.
 */
export function StatCards({ stats }: { stats: ShowStats }) {
  const cards = [
    { label: 'TICKETS SOLD', value: String(stats.soldCount), note: `of ${stats.capacity} seats` },
    { label: 'REVENUE', value: formatPrice(stats.revenueCents), note: 'paid orders' },
    {
      label: 'REFUNDED',
      value: formatPrice(stats.refundedCents),
      note: 'cancelled or refunded',
      // Amber only when there is something to look at — a zero is not a warning.
      tone: stats.refundedCents > 0 ? 'text-warn' : undefined,
    },
    {
      label: 'CHECKED IN',
      value: String(stats.checkedInCount),
      note: `of ${stats.soldCount} sold`,
    },
  ];

  return (
    <dl className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      {cards.map(({ label, value, note, tone }) => (
        <Card key={label} padding="lg" asChild>
          <div>
            <dt className="mb-2 font-mono text-[10px] tracking-[0.1em] text-fg-faint">{label}</dt>
            <dd>
              <p className={cn('font-display text-[28px] leading-none font-semibold', tone)}>
                {value}
              </p>
              <p className="mt-2 text-xs text-fg-muted">{note}</p>
            </dd>
          </div>
        </Card>
      ))}
    </dl>
  );
}
