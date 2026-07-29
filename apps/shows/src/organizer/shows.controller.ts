import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import {
  ORGANIZER_MESSAGE_PATTERNS,
  RPC_EXCHANGE,
  type CreateShowDto,
  type OrganizerShowsQuery,
  type PutPricingDto,
  type UpdateShowDto,
} from '@tickethub/contracts';
import { OrganizerShowsService } from './shows.service';
import { OrganizerPublishingService } from './publishing.service';

// An organizer's own shows. The buyer-facing catalog stays in `user/shows.controller.ts`.
@Controller()
export class OrganizerShowsController {
  constructor(
    private readonly showsService: OrganizerShowsService,
    private readonly publishingService: OrganizerPublishingService,
  ) {}

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORGANIZER_MESSAGE_PATTERNS.SHOW_IDS,
    queue: ORGANIZER_MESSAGE_PATTERNS.SHOW_IDS,
  })
  showIds(params: { userId: string }) {
    return this.showsService.showIds(params.userId);
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORGANIZER_MESSAGE_PATTERNS.MY_SHOWS,
    queue: ORGANIZER_MESSAGE_PATTERNS.MY_SHOWS,
  })
  myShows(params: { userId: string } & OrganizerShowsQuery) {
    return this.showsService.myShows(params.userId, { status: params.status });
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORGANIZER_MESSAGE_PATTERNS.CREATE_SHOW,
    queue: ORGANIZER_MESSAGE_PATTERNS.CREATE_SHOW,
  })
  createShow(params: { userId: string; dto: CreateShowDto }) {
    return this.showsService.createShow(params.userId, params.dto);
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORGANIZER_MESSAGE_PATTERNS.UPDATE_SHOW,
    queue: ORGANIZER_MESSAGE_PATTERNS.UPDATE_SHOW,
  })
  updateShow(params: { userId: string; showId: string; dto: UpdateShowDto }) {
    return this.showsService.updateShow(params.userId, params.showId, params.dto);
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORGANIZER_MESSAGE_PATTERNS.DELETE_SHOW,
    queue: ORGANIZER_MESSAGE_PATTERNS.DELETE_SHOW,
  })
  deleteShow(params: { userId: string; showId: string }) {
    return this.showsService.deleteShow(params.userId, params.showId);
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORGANIZER_MESSAGE_PATTERNS.PUT_PRICING,
    queue: ORGANIZER_MESSAGE_PATTERNS.PUT_PRICING,
  })
  putPricing(params: { userId: string; showId: string; dto: PutPricingDto }) {
    return this.publishingService.putPricing(params.userId, params.showId, params.dto);
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORGANIZER_MESSAGE_PATTERNS.PUBLISH_CHECKLIST,
    queue: ORGANIZER_MESSAGE_PATTERNS.PUBLISH_CHECKLIST,
  })
  publishChecklist(params: { userId: string; showId: string }) {
    return this.publishingService.publishChecklist(params.userId, params.showId);
  }

  @RabbitRPC({
    exchange: RPC_EXCHANGE,
    routingKey: ORGANIZER_MESSAGE_PATTERNS.PUBLISH_SHOW,
    queue: ORGANIZER_MESSAGE_PATTERNS.PUBLISH_SHOW,
  })
  publishShow(params: { userId: string; showId: string }) {
    return this.publishingService.publishShow(params.userId, params.showId);
  }
}
