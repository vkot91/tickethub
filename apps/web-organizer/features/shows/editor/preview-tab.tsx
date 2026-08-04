'use client';

import { useQuery } from '@tanstack/react-query';

import type { OrganizerShow, SeatTier } from '@tickethub/contracts';
import { formatPrice, Skeleton, TIER_DOT } from '@tickethub/ui';

import { fetchShowPricing, fetchVenueDetail, showKeys, venueKeys } from '../api';
import { seedAssignments } from './pricing-model';

/**
 * The public seat map as buyers will see it, drawn from the show's **saved** pricing.
 *
 * ponytail: this is a second, simpler renderer rather than a lift of
 * `apps/web-user/features/seat-map`. That one is a client screen around selection state, holds,
 * a polling query and an order mutation — none of which exist here, where every seat is
 * available by definition and nothing is clickable. Lifting it would mean splitting a
 * presentational half out of five files to save this one. The duplication is the row/seat
 * geometry and the tier tints, and it is recorded as debt in the slice doc. Move it to
 * `packages/ui` the day a third screen wants a seat map.
 */
export function PreviewTab({ show }: { show: OrganizerShow }) {
  const pricing = useQuery({
    queryKey: showKeys.pricing(show.id),
    queryFn: () => fetchShowPricing(show.id),
  });

  const venue = useQuery({
    queryKey: venueKeys.detail(show.venueId),
    queryFn: () => fetchVenueDetail(show.venueId),
  });

  if (pricing.isPending || venue.isPending) return <Skeleton className="h-100 rounded-panel" />;

  if (!pricing.data || !venue.data) {
    return (
      <p role="alert" className="text-sm text-fg-muted">
        This preview could not be loaded.
      </p>
    );
  }

  const bandById = new Map(pricing.data.ticketTypes.map((band) => [band.id, band]));
  const assignments = seedAssignments(pricing.data);
  const pricedSections = venue.data.sections.filter((section) => assignments[section.id]);

  return (
    <>
      <p className="mb-4.5 text-[13px] text-fg-muted">
        This is what buyers see. Seat availability is live once the show is published.
      </p>

      {pricedSections.length === 0 ? (
        <div className="rounded-panel border border-dashed border-white/16 px-6 py-15 text-center text-[13px] text-fg-muted">
          Nothing is on sale yet. Price at least one section on the Pricing tab.
        </div>
      ) : (
        <div className="mb-5 overflow-x-auto rounded-panel border border-line bg-seatmap p-6">
          <div className="min-w-120">
            <div className="mx-auto mb-5 flex h-7.5 max-w-65 items-center justify-center rounded-t-md rounded-b-[40px] border border-b-0 border-accent/40 bg-linear-to-b from-accent/35 to-transparent font-mono text-[10px] tracking-[0.35em] text-fg-secondary">
              STAGE
            </div>

            {pricedSections.map((section) => {
              const band = bandById.get(assignments[section.id]);

              return (
                <section key={section.id} className="mb-4 last:mb-0">
                  <h3 className="mb-3 font-mono text-[10px] tracking-[0.1em] text-fg-faint uppercase">
                    {section.name}
                  </h3>

                  <div className="flex flex-col gap-1.5">
                    {section.rows.map((row) => (
                      <div key={row.id} className="flex items-center gap-2.5">
                        {/* One band covers the whole section, so every row quotes the same price. */}
                        <span className="w-11 text-right font-mono text-[10px] text-fg-muted">
                          {band ? formatPrice(band.priceCents) : ''}
                        </span>
                        <span className="w-4 text-center font-display text-xs font-semibold text-fg-secondary">
                          {rowLetter(row.number)}
                        </span>

                        <div className="flex flex-wrap gap-1.5">
                          {row.seats.map((seat) => (
                            <span
                              key={seat.id}
                              className={`size-6.5 rounded-seat border bg-seat text-center font-mono text-[9px] leading-6 ${SEAT_TINT[band?.tier ?? 'standard']}`}
                            >
                              {seat.number}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* The public show page's price rows. Dearest first — the order the read route returns. */}
      <div className="flex max-w-105 flex-col gap-2">
        {pricing.data.ticketTypes.map((band) => (
          <div
            key={band.id}
            className="flex justify-between rounded-control border border-line bg-surface px-4 py-3 text-sm"
          >
            <span className="flex items-center gap-2.5">
              <span aria-hidden className={`size-2.5 rounded-sm ${TIER_DOT[band.tier]}`} />
              {band.name}
            </span>
            <span className="font-mono">{formatPrice(band.priceCents)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Same tints the buyer's available seat carries — the point of a preview is that it matches. */
const SEAT_TINT: Record<SeatTier, string> = {
  vip: 'border-tier-vip/55 text-tier-vip/90',
  standard: 'border-tier-standard/40 text-tier-standard',
  economy: 'border-tier-economy/40 text-tier-economy',
};

function rowLetter(rowNumber: number): string {
  return String.fromCharCode(64 + rowNumber);
}
