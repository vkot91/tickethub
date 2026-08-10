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
  SHOWS_MESSAGE_PATTERNS,
  createOrderSchema,
  orderListQuerySchema,
  type CreateOrderDto,
  type OrderList,
} from '@tickethub/contracts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { labelsFromSeatMap, withShowContext, type ShowContext } from '../shared/show-context';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class GatewayUserOrdersController {
  constructor(private readonly amqp: AmqpConnection) {}

  /**
   * The buyer's half of the show-context merge: the catalog's own two reads. `shared/` holds the
   * merge and knows no routing key, so this is where the audience is named.
   */
  private readonly fetchShow = async (showId: string): Promise<ShowContext> => {
    const [detail, seatMap] = await Promise.all([
      rpcRequest(this.amqp, SHOWS_MESSAGE_PATTERNS.DETAIL, { id: showId }),
      rpcRequest(this.amqp, SHOWS_MESSAGE_PATTERNS.SEAT_MAP, { id: showId }),
    ]);

    return { title: detail.title, labels: labelsFromSeatMap(seatMap.sections) };
  };

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
      items: await withShowContext(page.items, this.fetchShow),
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
