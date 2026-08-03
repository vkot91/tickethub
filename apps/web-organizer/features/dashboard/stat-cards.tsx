import { type ShowStats } from '@tickethub/contracts';
import { Card, formatPrice } from '@tickethub/ui';

function percent(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;
}

export function StatCards({ stats }: { stats: ShowStats }) {
  const cards = [
    { label: 'TICKETS SOLD', value: String(stats.soldCount), note: `of ${stats.capacity} seats` },
    {
      label: 'CAPACITY',
      value: percent(stats.soldCount, stats.capacity),
      note: `${stats.capacity - stats.soldCount} left`,
    },
    { label: 'REVENUE', value: formatPrice(stats.revenueCents), note: 'net of refunds' },
    {
      label: 'REFUNDED',
      value: formatPrice(stats.refundedCents),
      note: percent(stats.refundedCents, stats.revenueCents + stats.refundedCents),
    },
  ];

  return (
    <dl className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      {cards.map(({ label, value, note }) => (
        <Card key={label} padding="lg" asChild>
          <div>
            <dt className="mb-2 font-mono text-[10px] tracking-[0.1em] text-fg-faint">{label}</dt>
            <dd>
              <p className="font-display text-[28px] leading-none font-semibold">{value}</p>
              <p className="mt-2 text-xs text-fg-muted">{note}</p>
            </dd>
          </div>
        </Card>
      ))}
    </dl>
  );
}
