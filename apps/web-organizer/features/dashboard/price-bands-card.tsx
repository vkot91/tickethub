import { type ShowStats } from '@tickethub/contracts';
import { Card, Progress, TIER_DOT, TIER_LABELS } from '@tickethub/ui';

/**
 * One bar per price band of the selected show. Single-show only — the gateway resolves band names
 * for one show, and across several it would be adding up different `price_bands` rows that happen
 * to share a name. The caller decides that; this only renders what it is handed.
 */
export function PriceBandsCard({ byTier, soldCount }: Pick<ShowStats, 'byTier' | 'soldCount'>) {
  return (
    <Card padding="lg" asChild>
      <section aria-labelledby="price-bands-heading">
        <h2 id="price-bands-heading" className="mb-5 font-display text-lg font-semibold">
          Price bands
        </h2>

        {byTier.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing sold in this range.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {byTier.map((band) => (
              <li key={band.bandId}>
                <div className="mb-2 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={`size-2 rounded-pill ${TIER_DOT[band.tier]}`} />
                    {band.name || TIER_LABELS[band.tier]}
                  </span>
                  <span className="font-mono text-xs text-fg-muted">{band.soldCount}</span>
                </div>

                <Progress
                  value={band.soldCount}
                  max={soldCount}
                  className="w-full"
                  label={`${band.name || TIER_LABELS[band.tier]} — ${band.soldCount} of ${soldCount} sold`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
