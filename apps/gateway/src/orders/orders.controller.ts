import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ZodValidationPipe } from '@tickethub/common';
import { rpcRequest } from '@tickethub/rmq';
import {
  ORDERS_MESSAGE_PATTERNS,
  createOrderSchema,
  type CreateOrderDto,
} from '@tickethub/contracts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class GatewayOrdersController {
  constructor(private readonly amqp: AmqpConnection) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createOrderSchema))
  create(
    @Req() req: { user: { id: string }; headers: Record<string, string> },
    @Body() dto: CreateOrderDto,
  ) {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) throw new BadRequestException('Idempotency-Key header is required');
    return rpcRequest(this.amqp, ORDERS_MESSAGE_PATTERNS.CREATE, {
      userId: req.user.id,
      idempotencyKey,
      dto,
    });
  }

  @Get(':id')
  get(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORDERS_MESSAGE_PATTERNS.GET, { userId: req.user.id, orderId: id });
  }

  @Post(':id/refund')
  requestRefund(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORDERS_MESSAGE_PATTERNS.REQUEST_REFUND, {
      userId: req.user.id,
      orderId: id,
    });
  }
}
