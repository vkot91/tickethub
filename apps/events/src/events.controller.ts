import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, type CatalogQuery } from '@tickethub/contracts';
import { EventsService } from './events.service';

const message_keys = MESSAGE_PATTERNS.events;

@Controller()
export class EventsController {
  constructor(private readonly svc: EventsService) {}
  @MessagePattern(message_keys.catalog) catalog(@Payload() q: CatalogQuery) {
    return this.svc.catalog(q);
  }
  @MessagePattern(message_keys.detail) detail(@Payload() p: { id: string }) {
    return this.svc.detail(p.id);
  }
  @MessagePattern(message_keys.seatMap) seatMap(@Payload() p: { id: string }) {
    return this.svc.seatMap(p.id);
  }
}
