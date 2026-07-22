import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ZodValidationPipe } from '@tickethub/common';
import { rpcRequest } from '@tickethub/rmq';
import {
  PAYMENTS_MESSAGE_PATTERNS,
  createPaymentIntentSchema,
  type CreatePaymentIntentDto,
} from '@tickethub/contracts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller()
export class GatewayPaymentsController {
  constructor(private readonly amqp: AmqpConnection) {}

  @UseGuards(JwtAuthGuard)
  @Post('payments/intent')
  createIntent(
    @Req() req: { user: { id: string } },
    @Body(new ZodValidationPipe(createPaymentIntentSchema)) dto: CreatePaymentIntentDto,
  ) {
    return rpcRequest(this.amqp, PAYMENTS_MESSAGE_PATTERNS.CREATE_INTENT, {
      userId: req.user.id,
      dto,
    });
  }

  // No guard: Stripe calls this directly. Verification is by signature in the Payments service,
  // which needs the exact raw bytes — hence rawBody at the gateway and base64 over RMQ.
  @Post('webhooks/stripe')
  webhook(@Req() req: { rawBody: Buffer; headers: Record<string, string> }) {
    return rpcRequest(this.amqp, PAYMENTS_MESSAGE_PATTERNS.WEBHOOK, {
      rawBody: req.rawBody.toString('base64'),
      signature: req.headers['stripe-signature'],
    });
  }
}
