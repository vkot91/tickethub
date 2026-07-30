import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { PAYMENTS_MESSAGE_PATTERNS, type CreatePaymentIntentDto } from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @RabbitRPC(rpcSub(PAYMENTS_MESSAGE_PATTERNS.CREATE_INTENT))
  createIntent(msg: { userId: string; dto: CreatePaymentIntentDto }) {
    return this.paymentsService.createIntent(msg.userId, msg.dto);
  }
}
