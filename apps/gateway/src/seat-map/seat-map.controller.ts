import { Controller } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

import { EVENTS_QUEUES, ORDER_ROUTING_KEYS, type EventEnvelope } from '@tickethub/contracts';
import { eventSub } from '@tickethub/rmq';

import { SeatMapBroadcaster } from './seat-map.broadcaster';

/**
 * Everything that can change a seat's availability, turned into "this show changed". The three
 * handlers are identical by design — one queue per routing key keeps each event's own DLX, per
 * the convention in packages/contracts/src/transport.ts.
 *
 * ponytail: no `processed_messages` here, unlike every other consumer in the codebase. These
 * handlers are duplicate-*tolerant* rather than idempotent: a redelivery causes one redundant
 * refetch in some browsers, which costs nothing. Add inbox dedupe only if the broadcast ever
 * carries state instead of a bare show id.
 */
@Controller()
export class SeatMapEventsController {
  constructor(private readonly broadcaster: SeatMapBroadcaster) {}

  @RabbitSubscribe(eventSub(ORDER_ROUTING_KEYS.SEAT_HELD, EVENTS_QUEUES.GATEWAY_SEAT_HELD))
  onSeatHeld(event: EventEnvelope<typeof ORDER_ROUTING_KEYS.SEAT_HELD>) {
    this.broadcaster.touch(event.showId);
  }

  @RabbitSubscribe(eventSub(ORDER_ROUTING_KEYS.SEAT_RELEASED, EVENTS_QUEUES.GATEWAY_SEAT_RELEASED))
  onSeatReleased(event: EventEnvelope<typeof ORDER_ROUTING_KEYS.SEAT_RELEASED>) {
    this.broadcaster.touch(event.showId);
  }

  @RabbitSubscribe(eventSub(ORDER_ROUTING_KEYS.ORDER_PAID, EVENTS_QUEUES.GATEWAY_ORDER_PAID))
  onOrderPaid(event: EventEnvelope<typeof ORDER_ROUTING_KEYS.ORDER_PAID>) {
    this.broadcaster.touch(event.showId);
  }
}
