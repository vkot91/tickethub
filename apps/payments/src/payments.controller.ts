import { Controller } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import {
  MESSAGE_PATTERNS,
  ORDER_ROUTING_KEYS,
  type CreatePaymentIntentDto,
  type RefundRequestedEvent,
} from '@tickethub/contracts';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @MessagePattern(MESSAGE_PATTERNS.payments.createIntent)
  createIntent(@Payload() msg: { userId: string; dto: CreatePaymentIntentDto }) {
    return this.service.createIntent(msg.userId, msg.dto);
  }

  @EventPattern(ORDER_ROUTING_KEYS.refundRequested)
  onRefundRequested(@Payload() event: RefundRequestedEvent) {
    return this.service.refund(event);
  }
}
