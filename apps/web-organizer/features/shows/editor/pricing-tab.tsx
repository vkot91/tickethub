'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { OrganizerShow, SeatTier, ShowPricing, VenueDetail } from '@tickethub/contracts';
import {
  Button,
  Card,
  formatPrice,
  Input,
  Select,
  Skeleton,
  TIER_DOT,
  TIER_LABELS,
  toast,
} from '@tickethub/ui';

import { fetchShowPricing, fetchVenueDetail, putPricing, showKeys, venueKeys } from '../api';
import { centsToDollars, dollarsToCents } from './money';
import {
  assignSection,
  bandUsage,
  newBand,
  removeBand,
  seatCount,
  sectionSummary,
  seedAssignments,
  seedBands,
  toPutPricingBody,
  type BandDraft,
  type SectionAssignments,
} from './pricing-model';

const TIER_OPTIONS = (['vip', 'standard', 'economy'] as const).map((tier) => ({
  value: tier,
  label: TIER_LABELS[tier],
}));

const NOT_ON_SALE = 'none';

export function PricingTab({ show }: { show: OrganizerShow }) {
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
        This show’s pricing could not be loaded.
      </p>
    );
  }

  return (
    // Keyed on the saved pricing so a successful save reseeds the form from what the server
    // actually stored, rather than leaving the local drafts to drift from it.
    <PricingForm
      key={JSON.stringify(pricing.data)}
      show={show}
      pricing={pricing.data}
      sections={venue.data.sections}
    />
  );
}

interface PricingFormProps {
  show: OrganizerShow;
  pricing: ShowPricing;
  sections: VenueDetail['sections'];
}

function PricingForm({ show, pricing, sections }: PricingFormProps) {
  const queryClient = useQueryClient();

  const [bands, setBands] = useState<BandDraft[]>(() => seedBands(pricing));
  const [assignments, setAssignments] = useState<SectionAssignments>(() =>
    seedAssignments(pricing),
  );
  // Prices are held as typed text and parsed on blur, so a half-typed `19.` is not a price yet.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  // Pricing is draft-only — `putPricing` rejects anything else — so the whole tab goes read-only
  // the moment the show is on sale.
  const locked = show.status !== 'draft';

  const save = useMutation({
    mutationFn: () => putPricing(show.id, toPutPricingBody(bands, assignments)),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: showKeys.pricing(show.id) });
      // The checklist counts bands and priced sections, so it is stale the moment this lands.
      queryClient.invalidateQueries({ queryKey: showKeys.checklist(show.id) });
      toast.add('success', { title: 'Pricing saved' });
    },
    onError: (error) =>
      toast.add('danger', { title: 'Could not save pricing', body: error.message }),
  });

  function editBand(key: string, patch: Partial<BandDraft>) {
    setDirty(true);
    setBands((current) => current.map((band) => (band.key === key ? { ...band, ...patch } : band)));
  }

  function commitPrice(band: BandDraft) {
    const typed = priceDrafts[band.key];

    if (typed === undefined) return;

    const cents = dollarsToCents(typed);

    // An unparseable or negative price leaves the band on its previous number and puts the
    // input back to it, rather than saving a NaN the PUT would reject.
    setPriceDrafts(({ [band.key]: _dropped, ...rest }) => rest);

    if (cents !== null) editBand(band.key, { priceCents: cents });
  }

  const bandOptions = bands.map((band) => ({
    value: band.key,
    label: band.name.trim() || 'Untitled band',
  }));

  return (
    <div className="flex max-w-205 flex-col gap-5">
      <Card radius="panel" padding="lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Price bands</h2>

          {!locked && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setDirty(true);
                setBands((current) => [...current, newBand()]);
              }}
            >
              Add band
            </Button>
          )}
        </div>

        {bands.length === 0 ? (
          <p className="text-[13px] text-fg-muted">
            No bands yet. Add one to start pricing sections.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {bands.map((band) => {
              const usage = bandUsage(assignments, band.key);

              return (
                <div key={band.key}>
                  <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-2.5">
                    {locked ? (
                      <>
                        <span className="text-[13px]">{band.name}</span>
                        <span className="flex items-center gap-2 text-[13px] text-fg-secondary">
                          <span
                            aria-hidden
                            className={`size-2 rounded-sm ${TIER_DOT[band.tier]}`}
                          />
                          {TIER_LABELS[band.tier]}
                        </span>
                        <span className="font-mono text-[13px]">
                          {formatPrice(band.priceCents)}
                        </span>
                      </>
                    ) : (
                      <>
                        <Input
                          aria-label={`Band name`}
                          value={band.name}
                          onChange={(event) => editBand(band.key, { name: event.target.value })}
                          className="py-2 text-[13px]"
                        />

                        <Select
                          value={band.tier}
                          options={TIER_OPTIONS}
                          placeholder="Tier"
                          ariaLabel={`Tier for ${band.name.trim() || 'this band'}`}
                          onValueChange={(tier) => editBand(band.key, { tier: tier as SeatTier })}
                          className="rounded-control py-2"
                        />

                        <div className="flex items-center gap-1.5 rounded-control border border-line bg-deep px-3">
                          <span aria-hidden className="text-[13px] text-fg-muted">
                            $
                          </span>
                          <Input
                            inputMode="decimal"
                            aria-label={`Price in dollars for ${band.name.trim() || 'this band'}`}
                            value={priceDrafts[band.key] ?? centsToDollars(band.priceCents)}
                            onChange={(event) =>
                              setPriceDrafts((current) => ({
                                ...current,
                                [band.key]: event.target.value,
                              }))
                            }
                            onBlur={() => commitPrice(band)}
                            className="border-none bg-transparent px-0 py-2 font-mono text-[13px] focus-visible:border-none"
                          />
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          aria-label={`Remove ${band.name.trim() || 'this band'}`}
                          onClick={() => {
                            setDirty(true);
                            setBands((currentBands) => {
                              const next = removeBand(currentBands, assignments, band.key);
                              setAssignments(next.assignments);

                              return next.bands;
                            });
                          }}
                        >
                          ×
                        </Button>
                      </>
                    )}
                  </div>

                  {!locked && usage > 0 && (
                    <p className="mt-1 text-[11px] text-warn">
                      {usage} {usage === 1 ? 'section uses' : 'sections use'} this band. They’ll be
                      unassigned.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card radius="panel" padding="lg">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Sections</h2>
          <span className="font-mono text-[11px] text-fg-muted">
            {sectionSummary(sections, assignments)}
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          {sections.map((section) => {
            const assigned = bands.find((band) => band.key === assignments[section.id]);

            return (
              <div
                key={section.id}
                className={`grid grid-cols-[1.4fr_1.2fr_auto] items-center gap-3 ${assigned ? '' : 'opacity-60'}`}
              >
                <div>
                  <p className="font-display text-sm">{section.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
                    {seatCount(section)} SEATS
                  </p>
                </div>

                {locked ? (
                  <span className="text-[13px] text-fg-secondary">
                    {assigned ? assigned.name : '— Not on sale —'}
                  </span>
                ) : (
                  <Select
                    value={assignments[section.id] ?? NOT_ON_SALE}
                    options={[{ value: NOT_ON_SALE, label: '— Not on sale —' }, ...bandOptions]}
                    placeholder="— Not on sale —"
                    ariaLabel={`Price band for ${section.name}`}
                    onValueChange={(value) => {
                      setDirty(true);
                      setAssignments((current) =>
                        assignSection(current, section.id, value === NOT_ON_SALE ? null : value),
                      );
                    }}
                    className="rounded-control py-2"
                  />
                )}

                <div className="min-w-20 text-right">
                  {assigned ? (
                    <span className="flex items-center justify-end gap-1.5 font-mono text-[13px]">
                      <span
                        aria-hidden
                        className={`size-2 rounded-sm ${TIER_DOT[assigned.tier]}`}
                      />
                      {formatPrice(assigned.priceCents)}
                    </span>
                  ) : (
                    <span className="text-xs text-fg-muted">Not on sale</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="text-xs text-fg-muted">
        A section can have one band. Several sections can share a band.
      </p>

      {!locked && (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save pricing'}
          </Button>

          {/* ponytail: an in-tab dirty marker, not a navigation guard. The three tabs are links,
              so switching to Preview remounts this form and drops unsaved drafts — which is also
              why the Preview tab has no "save to see it here" note: it can only ever be looking
              at saved pricing. A real guard wants the tabs to stop being separate renders. */}
          {dirty && <span className="text-xs text-fg-muted">Unsaved changes</span>}
        </div>
      )}
    </div>
  );
}
