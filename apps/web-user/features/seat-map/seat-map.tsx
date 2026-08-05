'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatPrice, Skeleton, StatusPill, toast } from '@tickethub/ui';
import { ApiError } from '@tickethub/web-kit';

import { createOrder, fetchSeatMap, SEAT_MAP_POLL_MS, seatMapKeys, type OrderSeat } from './api';
import { findSeats, MAX_SEATS, toSeatMapView, type SeatView } from './model';
import { Seat } from './seat';
import { SeatLegend } from './seat-legend';
import { SelectionSummary } from './selection-summary';

const CONFLICT_MESSAGE = {
  title: 'Those seats just went',
  body: 'Someone else got there first. Your selection was cleared — pick again from the refreshed map.',
};

export function SeatMap({ showId }: { showId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Selection is plain local state: it is a draft until the order is created, and the
  // server is the only thing that can turn it into a hold.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data, isPending } = useQuery({
    queryKey: seatMapKeys.byShow(showId),
    queryFn: () => fetchSeatMap(showId),
    // Polling stands in for the seat socket until the gateway grows one.
    refetchInterval: SEAT_MAP_POLL_MS,
  });

  const order = useMutation({
    mutationFn: () => createOrder(showId, orderSeats()),
    onSuccess: (created) => router.push(`/orders/${created.id}/checkout`),
    onError: (error) => {
      if (error instanceof ApiError && error.kind === 'conflict') {
        setSelectedIds([]);
        queryClient.invalidateQueries({ queryKey: seatMapKeys.byShow(showId) });

        return void toast.add('warn', CONFLICT_MESSAGE);
      }

      toast.add('danger', { title: 'Could not hold those seats', body: error.message });
    },
  });

  if (isPending || !data) return <SeatMapSkeleton />;

  const sections = toSeatMapView(data);
  const selectedSeats = findSeats(sections, selectedIds);
  const heldCount = sections
    .flatMap((section) => section.rows)
    .flatMap((row) => [...row.left, ...row.right])
    .filter((seat) => seat.status === 'held').length;

  // Hoisted, so the mutation above can call it once a seat map has actually rendered.
  function orderSeats(): OrderSeat[] {
    return selectedSeats.map((seat) => {
      if (!seat.bandId) throw new Error(`Seat ${seat.label} is not on sale`);

      return { seatId: seat.id, bandId: seat.bandId };
    });
  }

  function toggleSeat(seat: SeatView) {
    setSelectedIds((current) => {
      if (current.includes(seat.id)) return current.filter((id) => id !== seat.id);

      return current.length >= MAX_SEATS ? current : [...current, seat.id];
    });
  }

  return (
    <>
      {heldCount > 0 ? (
        <StatusPill tone="warn" className="mb-6 gap-2 px-3 py-2 text-[11px]">
          <span aria-hidden className="size-1.5 animate-live rounded-pill bg-warn" />
          {heldCount} {heldCount === 1 ? 'seat' : 'seats'} being chosen right now
        </StatusPill>
      ) : null}

      <div className="overflow-x-auto rounded-panel border border-line bg-seatmap p-6">
        <div className="min-w-130">
          <div className="mx-auto mb-9 flex h-9 max-w-105 items-center justify-center rounded-t-md rounded-b-[40px] border border-accent/40 bg-linear-to-b from-accent/25 to-transparent font-mono text-[10px] tracking-[0.35em] text-fg-secondary">
            STAGE
          </div>

          {sections.map((section) => (
            <section key={section.id} className="mb-8 last:mb-0">
              <h2 className="mb-4 font-mono text-[10px] tracking-[0.1em] text-fg-faint uppercase">
                {section.name}
              </h2>

              <div className="flex flex-col gap-1.5">
                {section.rows.map((row) => (
                  <div key={row.id} className="flex items-center gap-3">
                    <span className="w-14 text-right font-mono text-[10px] text-fg-faint">
                      {formatPrice(row.priceCents)}
                    </span>
                    <span className="w-4 font-mono text-[11px] text-fg-muted">{row.letter}</span>

                    <div className="flex gap-1.5">
                      {row.left.map((seat) => (
                        <Seat
                          key={seat.id}
                          seat={seat}
                          isSelected={selectedIds.includes(seat.id)}
                          onToggle={toggleSeat}
                        />
                      ))}
                    </div>

                    <span aria-hidden className="w-6.5" />

                    <div className="flex gap-1.5">
                      {row.right.map((seat) => (
                        <Seat
                          key={seat.id}
                          seat={seat}
                          isSelected={selectedIds.includes(seat.id)}
                          onToggle={toggleSeat}
                        />
                      ))}
                    </div>

                    <span className="w-4 font-mono text-[11px] text-fg-muted">{row.letter}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <SeatLegend />

      <SelectionSummary
        seats={selectedSeats}
        isSubmitting={order.isPending}
        onRemove={toggleSeat}
        onContinue={() => order.mutate()}
      />
    </>
  );
}

function SeatMapSkeleton() {
  return (
    <div className="rounded-panel border border-line bg-seatmap p-6">
      <Skeleton className="mx-auto mb-9 h-9 max-w-105 rounded-t-md rounded-b-[40px]" />
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-6.5 w-full max-w-130" />
        ))}
      </div>
    </div>
  );
}
