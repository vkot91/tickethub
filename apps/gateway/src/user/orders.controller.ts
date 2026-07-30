import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
  orderListQuerySchema,
  type CreateOrderDto,
  type OrderList,
} from '@tickethub/contracts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ShowContextService } from '../shared/show-context.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class GatewayUserOrdersController {
  constructor(
    private readonly amqp: AmqpConnection,
    private readonly showContext: ShowContextService,
  ) {}

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

  @Get()
  async list(@Req() req: { user: { id: string } }, @Query() query: unknown): Promise<OrderList> {
    const page = await rpcRequest(this.amqp, ORDERS_MESSAGE_PATTERNS.LIST, {
      userId: req.user.id,
      query: orderListQuerySchema.parse(query),
    });

    return {
      items: await this.showContext.withShowContext(page.items),
      nextCursor: page.nextCursor,
    };
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
