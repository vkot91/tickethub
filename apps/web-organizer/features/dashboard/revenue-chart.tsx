import { type ShowStats } from '@tickethub/contracts';
import { Card, formatPrice } from '@tickethub/ui';

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });

/**
 * ponytail: seven bars, no chart library. The design's revenue chart is a bar per day with a
 * value above and a label below — CSS grid does that in a dozen lines. Reach for Recharts if
 * this ever needs axes, tooltips or a second series.
 */
export function RevenueChart({ byDay }: { byDay: ShowStats['byDay'] }) {
  const peak = Math.max(...byDay.map((day) => day.revenueCents), 1);

  return (
    <Card padding="lg" asChild>
      <section aria-labelledby="revenue-heading">
        <h2 id="revenue-heading" className="mb-6 font-display text-lg font-semibold">
          Revenue by day
        </h2>

        {byDay.length === 0 ? (
          <p className="text-sm text-fg-muted">No sales in this window yet.</p>
        ) : (
          <ul className="flex h-47.5 items-end gap-3">
            {byDay.map((day) => (
              <li key={day.date} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[10px] text-fg-secondary">
                  {formatPrice(day.revenueCents)}
                </span>

                <div
                  role="img"
                  aria-label={`${day.date}: ${formatPrice(day.revenueCents)} from ${day.count} orders`}
                  style={{ height: `${Math.max(2, (day.revenueCents / peak) * 100)}%` }}
                  className="w-full rounded-t-sm bg-linear-to-t from-accent/30 to-accent"
                />

                <span className="font-mono text-[10px] text-fg-faint">
                  {weekday.format(new Date(day.date))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
