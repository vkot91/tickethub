import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { TICKETS_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { TicketsService } from '../tickets.service';

/** A buyer reading their own tickets. Minting lives in `../issue.controller.ts`. */
@Controller()
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @RabbitRPC(rpcSub(TICKETS_MESSAGE_PATTERNS.LIST))
  list(params: { userId: string }) {
    return this.ticketsService.list(params.userId);
  }

  // Mints the presigned URL the gateway redirects to. Ownership is enforced in the service, at
  // this moment, not when the list was rendered.
  @RabbitRPC(rpcSub(TICKETS_MESSAGE_PATTERNS.PDF_URL))
  pdfUrl(params: { userId: string; ticketId: string }) {
    return this.ticketsService.pdfUrl(params.userId, params.ticketId);
  }
}
