import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import {
  ORGANIZER_MESSAGE_PATTERNS,
  type CreateShowDto,
  type OrganizerShowsQuery,
  type PosterUploadRequestDto,
  type PutPricingDto,
  type UpdateShowDto,
} from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { OrganizerShowsService } from './shows.service';
import { OrganizerPublishingService } from './publishing.service';
import { OrganizerPosterService } from './poster.service';

// An organizer's own shows. The buyer-facing catalog stays in `user/shows.controller.ts`.
@Controller()
export class OrganizerShowsController {
  constructor(
    private readonly showsService: OrganizerShowsService,
    private readonly publishingService: OrganizerPublishingService,
    private readonly posterService: OrganizerPosterService,
  ) {}

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.SHOW_IDS))
  showIds(params: { userId: string }) {
    return this.showsService.showIds(params.userId);
  }

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.CAPACITY))
  capacity(params: { showIds: string[] }) {
    return this.showsService.capacity(params.showIds);
  }

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.MY_SHOWS))
  myShows(params: { userId: string } & OrganizerShowsQuery) {
    return this.showsService.myShows(params.userId, { status: params.status });
  }

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.GET_SHOW))
  getShow(params: { userId: string; showId: string }) {
    return this.showsService.getShow(params.userId, params.showId);
  }

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.CREATE_SHOW))
  createShow(params: { userId: string; dto: CreateShowDto }) {
    return this.showsService.createShow(params.userId, params.dto);
  }

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.UPDATE_SHOW))
  updateShow(params: { userId: string; showId: string; dto: UpdateShowDto }) {
    return this.showsService.updateShow(params.userId, params.showId, params.dto);
  }

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.DELETE_SHOW))
  deleteShow(params: { userId: string; showId: string }) {
    return this.showsService.deleteShow(params.userId, params.showId);
  }

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.PUT_PRICING))
  putPricing(params: { userId: string; showId: string; dto: PutPricingDto }) {
    return this.publishingService.putPricing(params.userId, params.showId, params.dto);
  }

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.PUBLISH_CHECKLIST))
  publishChecklist(params: { userId: string; showId: string }) {
    return this.publishingService.publishChecklist(params.userId, params.showId);
  }

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.PUBLISH_SHOW))
  publishShow(params: { userId: string; showId: string }) {
    return this.publishingService.publishShow(params.userId, params.showId);
  }

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.POSTER_UPLOAD_URL))
  posterUploadUrl(params: { userId: string; showId: string; dto: PosterUploadRequestDto }) {
    return this.posterService.posterUploadUrl(params.userId, params.showId, params.dto.contentType);
  }
}
