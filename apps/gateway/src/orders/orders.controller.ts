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
  type OrderSummary,
  type OrderSummaryPage,
  type SeatMap,
  type ShowDetail,
} from '@tickethub/contracts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

/** Row 1 seat 2 → "A2", matching what the seat map screen renders. */
const seatLabel = (rowNumber: number, seatNumber: number): string =>
  `${String.fromCharCode(64 + rowNumber)}${seatNumber}`;

interface ShowContext {
  title: string;
  labels: Map<string, string>;
}

const UNKNOWN_SHOW: ShowContext = { title: 'Unavailable show', labels: new Map() };

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

  @Get()
  async list(@Req() req: { user: { id: string } }, @Query() query: unknown): Promise<OrderList> {
    const page = await rpcRequest<OrderSummaryPage>(this.amqp, ORDERS_MESSAGE_PATTERNS.LIST, {
      userId: req.user.id,
      query: orderListQuerySchema.parse(query),
    });

    return { items: await this.withShowContext(page.items), nextCursor: page.nextCursor };
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

  // Orders owns the order; Shows owns the title and the seat labels. No cross-service JOIN
  // exists to get both, so the gateway fans out — once per distinct show, not once per order.
  private async withShowContext(items: OrderSummary[]): Promise<OrderList['items']> {
    const showIds = [...new Set(items.map((item) => item.showId))];

    const contexts = new Map(
      await Promise.all(
        showIds.map(async (showId) => [showId, await this.showContext(showId)] as const),
      ),
    );

    return items.map((item) => {
      const context = contexts.get(item.showId) ?? UNKNOWN_SHOW;

      return {
        ...item,
        showTitle: context.title,
        seatLabels: item.seats.flatMap((seat) => context.labels.get(seat.seatId) ?? []),
      };
    });
  }

  // ponytail: two RPCs per distinct show, and the seat map hauls back a whole venue's geometry
  // for a handful of labels. Denormalise the title onto the order and the label onto the
  // reservation at creation time if this page ever gets slow.
  private async showContext(showId: string): Promise<ShowContext> {
    try {
      const [detail, seatMap] = await Promise.all([
        rpcRequest<ShowDetail>(this.amqp, SHOWS_MESSAGE_PATTERNS.DETAIL, { id: showId }),
        rpcRequest<SeatMap>(this.amqp, SHOWS_MESSAGE_PATTERNS.SEAT_MAP, { id: showId }),
      ]);

      const labels = new Map<string, string>();

      for (const section of seatMap.sections) {
        for (const row of section.rows) {
          for (const seat of row.seats) labels.set(seat.id, seatLabel(row.number, seat.number));
        }
      }

      return { title: detail.title, labels };
    } catch {
      // A cancelled or purged show must not take the whole orders page down with it.
      return UNKNOWN_SHOW;
    }
  }
}
