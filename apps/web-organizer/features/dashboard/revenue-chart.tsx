import { type ShowStats } from '@tickethub/contracts';
import { Card, formatPrice } from '@tickethub/ui';

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });

const MAX_BARS = 30;

export function RevenueChart({ byDay: window }: { byDay: ShowStats['byDay'] }) {
  const byDay = window.slice(-MAX_BARS);

  const peak = Math.max(...byDay.map((day) => day.revenueCents), 1);

  return (
    <Card padding="lg" asChild>
      <section aria-labelledby="revenue-heading" className="min-w-0">
        <h2 id="revenue-heading" className="mb-6 font-display text-lg font-semibold">
          Revenue by day
        </h2>

        {byDay.length === 0 ? (
          <p className="text-sm text-fg-muted">No sales in this window yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <ul className="flex h-47.5 items-stretch gap-3">
              {byDay.map((day) => (
                <li key={day.date} className="flex w-11 shrink-0 flex-col items-center gap-2">
                  <span className="font-mono text-[10px] text-fg-secondary">
                    {formatPrice(day.revenueCents)}
                  </span>

                  <div className="flex w-full flex-1 items-end">
                    <div
                      role="img"
                      aria-label={`${day.date}: ${formatPrice(day.revenueCents)} from ${day.count} orders`}
                      style={{ height: `${Math.max(2, (day.revenueCents / peak) * 100)}%` }}
                      className="w-full rounded-t-sm bg-linear-to-t from-accent/30 to-accent"
                    />
                  </div>

                  <span className="font-mono text-[10px] text-fg-faint">
                    {weekday.format(new Date(day.date))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </Card>
  );
}
