import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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

  // One pattern, whatever the status: slice 4 turns this into delete-or-cancel inside `apps/shows`,
  // where the status is read and acted on in the same place.
  @Delete(':id')
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORGANIZER_MESSAGE_PATTERNS.DELETE_SHOW, {
      userId: req.user.id,
      showId: id,
    });
  }
}
