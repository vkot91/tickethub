import { Controller } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import {
  MESSAGE_PATTERNS,
  PAYMENT_ROUTING_KEYS,
  EVENT_ROUTING_KEYS,
  type CreateOrderDto,
  type PaymentSucceededEvent,
  type PaymentFailedEvent,
  type RefundSucceededEvent,
} from '@tickethub/contracts';
import { OrdersService } from './orders.service';

const keys = MESSAGE_PATTERNS.orders;

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern(keys.create)
  create(@Payload() payload: { userId: string; idempotencyKey: string; dto: CreateOrderDto }) {
    return this.ordersService.create(payload.userId, payload.idempotencyKey, payload.dto);
  }

  @MessagePattern(keys.get)
  get(@Payload() payload: { userId: string; orderId: string }) {
    return this.ordersService.get(payload.userId, payload.orderId);
  }

  @MessagePattern(keys.requestRefund)
  requestRefund(@Payload() payload: { userId: string; orderId: string }) {
    return this.ordersService.requestRefund(payload.userId, payload.orderId);
  }

  // --- Saga consumers on payments.events / catalog.events ---

  @EventPattern(PAYMENT_ROUTING_KEYS.paymentSucceeded)
  onPaymentSucceeded(@Payload() e: PaymentSucceededEvent) {
    return this.ordersService.markPaid(e);
  }

  @EventPattern(PAYMENT_ROUTING_KEYS.paymentFailed)
  onPaymentFailed(@Payload() e: PaymentFailedEvent) {
    return this.ordersService.markFailed(e);
  }

  @EventPattern(PAYMENT_ROUTING_KEYS.refundSucceeded)
  onRefundSucceeded(@Payload() e: RefundSucceededEvent) {
    return this.ordersService.markRefunded(e);
  }

  @EventPattern(EVENT_ROUTING_KEYS.eventCancelled)
  onEventCancelled(@Payload() e: { messageId: string; eventId: string }) {
    return this.ordersService.refundAllPaidForEvent(e);
  }
}
