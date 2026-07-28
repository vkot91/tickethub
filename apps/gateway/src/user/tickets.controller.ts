import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { rpcRequest } from '@tickethub/rmq';
import { TICKETS_MESSAGE_PATTERNS, type TicketList, type TicketPdfUrl } from '@tickethub/contracts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

// ponytail: the two methods we call, rather than pulling @types/express in for one route.
interface RedirectResponse {
  setHeader(name: string, value: string): void;
  redirect(status: number, url: string): void;
}

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class GatewayUserTicketsController {
  constructor(private readonly amqp: AmqpConnection) {}

  @Get()
  list(@Req() req: { user: { id: string } }): Promise<TicketList> {
    return rpcRequest<TicketList>(this.amqp, TICKETS_MESSAGE_PATTERNS.LIST, {
      userId: req.user.id,
    });
  }

  /**
   * Redirects to a 60-second presigned S3 URL minted right now. The bytes never cross this
   * process — the whole point of presigning — while authorization still happens at click time,
   * so a refunded or reassigned ticket stops downloading immediately rather than whenever some
   * previously handed-out URL happened to expire.
   *
   * `Cache-Control: no-store` because the 302's Location header carries a perishable credential;
   * a cached redirect would serve a dead link a minute later.
   */
  @Get(':id/pdf')
  async pdf(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Res() res: RedirectResponse,
  ): Promise<void> {
    const { url } = await rpcRequest<TicketPdfUrl>(this.amqp, TICKETS_MESSAGE_PATTERNS.PDF_URL, {
      userId: req.user.id,
      ticketId: id,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, url);
  }
}
