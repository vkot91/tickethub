import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { RPC_EXCHANGE, SHOWS_MESSAGE_PATTERNS, type CatalogQuery } from '@tickethub/contracts';
import { ShowsService } from './shows.service';

@Controller()
export class ShowsController {
  constructor(private readonly showsService: ShowsService) {}

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: SHOWS_MESSAGE_PATTERNS.CATALOG })
  catalog(query: CatalogQuery) {
    return this.showsService.catalog(query);
  }

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: SHOWS_MESSAGE_PATTERNS.DETAIL })
  detail(params: { id: string }) {
    return this.showsService.detail(params.id);
  }

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: SHOWS_MESSAGE_PATTERNS.SEAT_MAP })
  seatMap(params: { id: string }) {
    return this.showsService.seatMap(params.id);
  }
}
