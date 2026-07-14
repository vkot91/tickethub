import { BadRequestException, Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PaymentsService } from './payments.service';

@Controller()
export class WebhookController {
  constructor(private readonly service: PaymentsService) {}

  // Gateway forwards { rawBody: base64, signature } here; guards are bypassed at the gateway.
  @MessagePattern('payments.webhook')
  async handle(@Payload() msg: { rawBody: string; signature: string }) {
    try {
      await this.service.handleWebhook(Buffer.from(msg.rawBody, 'base64'), msg.signature);
      return { received: true };
    } catch {
      throw new BadRequestException('Invalid signature');
    }
  }
}
