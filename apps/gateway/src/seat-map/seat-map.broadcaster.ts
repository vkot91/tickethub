import { Injectable, type OnModuleDestroy } from '@nestjs/common';

/** The Socket.IO room a show's watchers join. */
export const SEAT_MAP_ROOM = (showId: string) => `show:${showId}`;

/** The only message this stream carries. Payload is `{ showId }` — the client refetches. */
export const SEAT_MAP_EVENT = 'seat-map:changed';

/**
 * How long a show's changes are collected before one broadcast goes out. An 8-seat order emits
 * eight `seat.held` events (one per seat, by design), and every connected browser answers a
 * broadcast with a refetch of the *stitched* endpoint — shows plus an orders RPC. Coalescing is
 * the only place that can see a burst spanning several orders, which the client cannot.
 *
 * The cost, stated so nobody has to rediscover it: the seat map is eventually consistent within
 * this window, not instantly.
 */
export const SEAT_MAP_COALESCE_MS = 250;

type Emit = (showId: string) => void;

@Injectable()
export class SeatMapBroadcaster implements OnModuleDestroy {
  // ponytail: an in-process timer per show, which is right because each replica coalesces only
  // the messages it received. If a show ever needs one broadcast per *cluster* rather than per
  // replica, that is a Redis-side dedupe, not a bigger map.
  private readonly pending = new Map<string, NodeJS.Timeout>();

  constructor(private readonly emit: Emit) {}

  touch(showId: string): void {
    if (this.pending.has(showId)) return;

    const timer = setTimeout(() => {
      this.pending.delete(showId);
      this.emit(showId);
    }, SEAT_MAP_COALESCE_MS);

    this.pending.set(showId, timer);
  }

  onModuleDestroy(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);

    this.pending.clear();
  }
}
