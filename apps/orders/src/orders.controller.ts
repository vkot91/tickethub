import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { ORDERS_MESSAGE_PATTERNS, RPC_EXCHANGE, type CreateOrderDto } from '@tickethub/contracts';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORDERS_MESSAGE_PATTERNS.CREATE,
    queue: ORDERS_MESSAGE_PATTERNS.CREATE,
  })
  create(payload: { userId: string; idempotencyKey: string; dto: CreateOrderDto }) {
    return this.ordersService.create(payload.userId, payload.idempotencyKey, payload.dto);
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORDERS_MESSAGE_PATTERNS.GET,
    queue: ORDERS_MESSAGE_PATTERNS.GET,
  })
  get(payload: { userId: string; orderId: string }) {
    return this.ordersService.get(payload.userId, payload.orderId);
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORDERS_MESSAGE_PATTERNS.REQUEST_REFUND,
    queue: ORDERS_MESSAGE_PATTERNS.REQUEST_REFUND,
  })
  requestRefund(payload: { userId: string; orderId: string }) {
    return this.ordersService.requestRefund(payload.userId, payload.orderId);
  }
}
