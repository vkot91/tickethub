import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import {
  ORDERS_MESSAGE_PATTERNS,
  type CreateOrderDto,
  type OrderListQuery,
} from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { OrdersService } from '../orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @RabbitRPC(rpcSub(ORDERS_MESSAGE_PATTERNS.CREATE))
  create(payload: { userId: string; idempotencyKey: string; dto: CreateOrderDto }) {
    return this.ordersService.create(payload.userId, payload.idempotencyKey, payload.dto);
  }

  @RabbitRPC(rpcSub(ORDERS_MESSAGE_PATTERNS.GET))
  get(payload: { userId: string; orderId: string }) {
    return this.ordersService.get(payload.userId, payload.orderId);
  }

  @RabbitRPC(rpcSub(ORDERS_MESSAGE_PATTERNS.LIST))
  list(payload: { userId: string; query: OrderListQuery }) {
    return this.ordersService.list(payload.userId, payload.query);
  }

  @RabbitRPC(rpcSub(ORDERS_MESSAGE_PATTERNS.REQUEST_REFUND))
  requestRefund(payload: { userId: string; orderId: string }) {
    return this.ordersService.requestRefund(payload.userId, payload.orderId);
  }

  // The one key here that is not scoped to a buyer: it answers about a show, which is the same
  // public question the unguarded `GET /shows/:id/seat-map` already answers.
  @RabbitRPC(rpcSub(ORDERS_MESSAGE_PATTERNS.SEAT_STATUS))
  seatStatus(payload: { showId: string }) {
    return this.ordersService.seatStatus(payload.showId);
  }
}
