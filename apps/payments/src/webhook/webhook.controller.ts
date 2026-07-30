import { BadRequestException, Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { PAYMENTS_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { WebhookService } from './webhook.service';

@Controller()
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  // Gateway forwards { rawBody: base64, signature } here; guards are bypassed at the gateway.
  @RabbitRPC(rpcSub(PAYMENTS_MESSAGE_PATTERNS.WEBHOOK))
  async handle(msg: { rawBody: string; signature: string }) {
    try {
      await this.webhookService.handleWebhook(Buffer.from(msg.rawBody, 'base64'), msg.signature);
      return { received: true };
    } catch {
      throw new BadRequestException('Invalid signature');
    }
  }
}
