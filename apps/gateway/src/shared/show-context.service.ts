import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { rpcRequest } from '@tickethub/rmq';
import { SHOWS_MESSAGE_PATTERNS } from '@tickethub/contracts';

/** Row 1 seat 2 → "A2", matching what the seat map screen renders. */
const seatLabel = (rowNumber: number, seatNumber: number): string =>
  `${String.fromCharCode(64 + rowNumber)}${seatNumber}`;

interface ShowContext {
  title: string;
  labels: Map<string, string>;
}

/** All this merge needs of a row: which show, and which seats. The rest rides along untouched. */
interface Contextual {
  showId: string;
  seats: { seatId: string }[];
}

const UNKNOWN_SHOW: ShowContext = { title: 'Unavailable show', labels: new Map() };

/**
 * Orders owns the order; Shows owns the title and the seat labels. No cross-service JOIN exists
 * to get both, so the gateway fans out — once per distinct show, not once per order.
 *
 * Shared by both audiences: the buyer's order list and the organizer's recent-orders table need
 * the same merge, so it lives here rather than in either controller.
 */
@Injectable()
export class ShowContextService {
  constructor(private readonly amqp: AmqpConnection) {}

  async withShowContext<T extends Contextual>(
    items: T[],
  ): Promise<(T & { showTitle: string; seatLabels: string[] })[]> {
    const showIds = [...new Set(items.map((item) => item.showId))];

    const contexts = new Map(
      await Promise.all(
        showIds.map(async (showId) => [showId, await this.showContext(showId)] as const),
      ),
    );

    return items.map((item) => {
      const context = contexts.get(item.showId) ?? UNKNOWN_SHOW;

      return {
        ...item,
        showTitle: context.title,
        seatLabels: item.seats.flatMap((seat) => context.labels.get(seat.seatId) ?? []),
      };
    });
  }

  // ponytail: two RPCs per distinct show, and the seat map hauls back a whole venue's geometry
  // for a handful of labels. Denormalise the title onto the order and the label onto the
  // reservation at creation time if this page ever gets slow.
  private async showContext(showId: string): Promise<ShowContext> {
    try {
      const [detail, seatMap] = await Promise.all([
        rpcRequest(this.amqp, SHOWS_MESSAGE_PATTERNS.DETAIL, { id: showId }),
        rpcRequest(this.amqp, SHOWS_MESSAGE_PATTERNS.SEAT_MAP, { id: showId }),
      ]);

      const labels = new Map<string, string>();

      for (const section of seatMap.sections) {
        for (const row of section.rows) {
          for (const seat of row.seats) labels.set(seat.id, seatLabel(row.number, seat.number));
        }
      }

      return { title: detail.title, labels };
    } catch {
      // A cancelled or purged show must not take the whole orders page down with it.
      return UNKNOWN_SHOW;
    }
  }
}
