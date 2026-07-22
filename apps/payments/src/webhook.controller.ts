import { BadRequestException, Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { PAYMENTS_MESSAGE_PATTERNS, RPC_EXCHANGE } from '@tickethub/contracts';
import { PaymentsService } from './payments.service';

@Controller()
export class WebhookController {
  constructor(private readonly service: PaymentsService) {}

  // Gateway forwards { rawBody: base64, signature } here; guards are bypassed at the gateway.
  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: PAYMENTS_MESSAGE_PATTERNS.WEBHOOK })
  async handle(msg: { rawBody: string; signature: string }) {
    try {
      await this.service.handleWebhook(Buffer.from(msg.rawBody, 'base64'), msg.signature);
      return { received: true };
    } catch {
      throw new BadRequestException('Invalid signature');
    }
  }
}
