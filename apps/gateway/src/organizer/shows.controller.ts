import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Roles } from '@tickethub/common';
import {
  ORGANIZER_MESSAGE_PATTERNS,
  createShowSchema,
  organizerShowsQuerySchema,
  putPricingSchema,
  updateShowSchema,
} from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * The organizer's own shows. Guards sit on the class, not the handlers, so a route added later is
 * guarded by default rather than public by accident. `user/shows.controller.ts` stays unguarded
 * catalog reads — the split is the audience, not the service.
 *
 * Ownership is never checked here: `apps/shows` filters every read and write on the organizer of
 * the calling user, and answers 404 for a row that is not theirs.
 */
@Controller('organizer/shows')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('organizer')
export class GatewayOrganizerShowsController {
  constructor(private readonly amqp: AmqpConnection) {}

  @Get()
  getList(@Req() req: { user: { id: string } }, @Query() query: unknown) {
    return rpcRequest(this.amqp, ORGANIZER_MESSAGE_PATTERNS.MY_SHOWS, {
      userId: req.user.id,
      ...organizerShowsQuerySchema.parse(query),
    });
  }

  @Post()
  create(@Req() req: { user: { id: string } }, @Body() body: unknown) {
    return rpcRequest(this.amqp, ORGANIZER_MESSAGE_PATTERNS.CREATE_SHOW, {
      userId: req.user.id,
      dto: createShowSchema.parse(body),
    });
  }

  @Patch(':id')
  update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: unknown) {
    return rpcRequest(this.amqp, ORGANIZER_MESSAGE_PATTERNS.UPDATE_SHOW, {
      userId: req.user.id,
      showId: id,
      dto: updateShowSchema.parse(body),
    });
  }

  // What still stands between this draft and going on sale. A convenience for the popover — the
  // publish route re-checks the same rules, because this answer is stale the moment it is read.
  @Get(':id/publish-checklist')
  publishChecklist(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORGANIZER_MESSAGE_PATTERNS.PUBLISH_CHECKLIST, {
      userId: req.user.id,
      showId: id,
    });
  }

  @Post(':id/publish')
  publish(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORGANIZER_MESSAGE_PATTERNS.PUBLISH_SHOW, {
      userId: req.user.id,
      showId: id,
    });
  }

  // PUT, not PATCH: the body is the show's whole pricing, and `apps/shows` replaces it wholesale.
  @Put(':id/pricing')
  putPricing(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: unknown) {
    return rpcRequest(this.amqp, ORGANIZER_MESSAGE_PATTERNS.PUT_PRICING, {
      userId: req.user.id,
      showId: id,
      dto: putPricingSchema.parse(body),
    });
  }

  // One pattern, whatever the status: `apps/shows` reads the status and either deletes the draft
  // or cancels the published show, so the client never picks a verb from a stale status.
  @Delete(':id')
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORGANIZER_MESSAGE_PATTERNS.DELETE_SHOW, {
      userId: req.user.id,
      showId: id,
    });
  }
}
