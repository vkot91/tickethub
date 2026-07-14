import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ZodValidationPipe } from '@tickethub/common';
import {
  createPaymentIntentSchema,
  MESSAGE_PATTERNS,
  type CreatePaymentIntentDto,
} from '@tickethub/contracts';
import { RPC } from '../tokens';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller()
export class GatewayPaymentsController {
  constructor(@Inject(RPC.payments) private readonly client: ClientProxy) {}

  @UseGuards(JwtAuthGuard)
  @Post('payments/intent')
  createIntent(
    @Req() req: { user: { id: string } },
    @Body(new ZodValidationPipe(createPaymentIntentSchema)) dto: CreatePaymentIntentDto,
  ) {
    return firstValueFrom(
      this.client.send(MESSAGE_PATTERNS.payments.createIntent, { userId: req.user.id, dto }),
    );
  }

  // No guard: Stripe calls this directly. Verification is by signature in the Payments service,
  // which needs the exact raw bytes — hence rawBody at the gateway and base64 over RMQ.
  @Post('webhooks/stripe')
  webhook(@Req() req: { rawBody: Buffer; headers: Record<string, string> }) {
    return firstValueFrom(
      this.client.send(MESSAGE_PATTERNS.payments.webhook, {
        rawBody: req.rawBody.toString('base64'),
        signature: req.headers['stripe-signature'],
      }),
    );
  }
}
