import { Controller } from '@nestjs/common';
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq';
import { ORGANIZER_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcSub } from '@tickethub/rmq';
import { OrganizerService } from './organizer.service';

// The organizer profile. Organizer-only RPCs never share a file with the buyer-facing catalog —
// the gateway splits the same way, so an audience is one folder end to end.
@Controller()
export class OrganizerController {
  constructor(private readonly organizerService: OrganizerService) {}

  @RabbitRPC(rpcSub(ORGANIZER_MESSAGE_PATTERNS.CREATE))
  create(params: { userId: string; name: string }) {
    return this.organizerService.create(params.userId, params.name);
  }
}
