import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import {
  PAYMENTS_MESSAGE_PATTERNS,
  RPC_EXCHANGE,
  type CreatePaymentIntentDto,
} from '@tickethub/contracts';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: PAYMENTS_MESSAGE_PATTERNS.CREATE_INTENT,
    queue: PAYMENTS_MESSAGE_PATTERNS.CREATE_INTENT,
  })
  createIntent(msg: { userId: string; dto: CreatePaymentIntentDto }) {
    return this.paymentsService.createIntent(msg.userId, msg.dto);
  }
}
