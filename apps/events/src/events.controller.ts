import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, type CatalogQuery } from '@tickethub/contracts';
import { EventsService } from './events.service';

const message_keys = MESSAGE_PATTERNS.events;

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}
  @MessagePattern(message_keys.catalog) catalog(@Payload() q: CatalogQuery) {
    return this.eventsService.catalog(q);
  }
  @MessagePattern(message_keys.detail) detail(@Payload() p: { id: string }) {
    return this.eventsService.detail(p.id);
  }
  @MessagePattern(message_keys.seatMap) seatMap(@Payload() p: { id: string }) {
    return this.eventsService.seatMap(p.id);
  }
}
