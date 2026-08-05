import { type ShowStats } from '@tickethub/contracts';
import { Card, formatPrice } from '@tickethub/ui';

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });

/**
 * ponytail: seven bars, no chart library. The design's revenue chart is a bar per day with a
 * value above and a label below — CSS grid does that in a dozen lines. Reach for Recharts if
 * this ever needs axes, tooltips or a second series.
 */
/** ponytail: the tail, not the whole window. "All time" sends a 2020 floor and the backend
 *  zero-fills every day since, which is thousands of bars three pixels wide. Widen this the day
 *  the chart gets an axis that can carry them. */
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
          // `overflow-x-auto` rather than shrinking the bars to fit: past a handful of bars a
          // fixed per-bar width stays readable, a squeezed one does not. Scrolls inside its own
          // box, never the page — the grid track this card sits in is `minmax(0, …)` so it can
          // shrink to make room for the scrollbar instead of blowing out the page width.
          <div className="overflow-x-auto">
            {/* `items-stretch`, not `items-end`: a bar's `height: n%` needs an ancestor with a
                real pixel height to be a percentage *of*, and a shrink-to-fit `<li>` never gives
                it one — the bars silently render at 0 height. Stretching the `<li>` to the row's
                `h-47.5` and pushing the bar to the bottom with its own `items-end` wrapper is what
                actually gives the percentage something to resolve against. */}
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
