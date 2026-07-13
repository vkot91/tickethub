import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, type CreateOrderDto } from '@tickethub/contracts';
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

  @MessagePattern(keys.confirmTest)
  confirmTest(@Payload() payload: { orderId: string }) {
    return this.ordersService.confirmTest(payload.orderId);
  }
}
