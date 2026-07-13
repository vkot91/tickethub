import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ZodValidationPipe } from '@tickethub/common';
import { ConfigService } from '@tickethub/config';
import { createOrderSchema, MESSAGE_PATTERNS, type CreateOrderDto } from '@tickethub/contracts';
import { RPC } from '../tokens';
import type { Config } from '../config';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

const keys = MESSAGE_PATTERNS.orders;

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class GatewayOrdersController {
  constructor(
    @Inject(RPC.orders) private readonly orders: ClientProxy,
    private readonly config: ConfigService<Config, true>,
  ) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createOrderSchema))
  create(
    @Req() req: { user: { id: string }; headers: Record<string, string> },
    @Body() dto: CreateOrderDto,
  ) {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) throw new BadRequestException('Idempotency-Key header is required');
    return firstValueFrom(
      this.orders.send(keys.create, { userId: req.user.id, idempotencyKey, dto }),
    );
  }

  @Get(':id')
  get(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return firstValueFrom(this.orders.send(keys.get, { userId: req.user.id, orderId: id }));
  }

  // ponytail: dev/test only — simulates a Stripe success until Phase 3 wires real webhooks.
  @Post(':id/confirm-test')
  confirmTest(@Param('id') id: string) {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new BadRequestException('Not available');
    }
    return firstValueFrom(this.orders.send(keys.confirmTest, { orderId: id }));
  }
}
