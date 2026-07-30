import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { SHOWS_MESSAGE_PATTERNS, type CatalogQuery } from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { UserShowsService } from './shows.service';

@Controller()
export class UserShowsController {
  constructor(private readonly showsService: UserShowsService) {}

  @RabbitRPC(rpcSub(SHOWS_MESSAGE_PATTERNS.CATALOG))
  catalog(query: CatalogQuery) {
    return this.showsService.catalog(query);
  }

  @RabbitRPC(rpcSub(SHOWS_MESSAGE_PATTERNS.DETAIL))
  detail(params: { id: string }) {
    return this.showsService.detail(params.id);
  }

  @RabbitRPC(rpcSub(SHOWS_MESSAGE_PATTERNS.SEAT_MAP))
  seatMap(params: { id: string }) {
    return this.showsService.seatMap(params.id);
  }
}
