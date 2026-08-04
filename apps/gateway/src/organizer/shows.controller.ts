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
import type { ZodSchema, TypeOf } from 'zod';
import { Roles, ZodValidationPipe } from '@tickethub/common';
import {
  ORGANIZER_SHOWS_MESSAGE_PATTERNS,
  createShowSchema,
  organizerShowsQuerySchema,
  posterUploadRequestSchema,
  putPricingSchema,
  updateShowSchema,
} from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Validate a request body or query here rather than via `@Body(new ZodValidationPipe(...))`: a
 * param-level pipe means calling a handler directly in a unit test never validates at all, so the
 * "rejects a malformed body" specs would pass while asserting nothing.
 *
 * Going through the pipe rather than `schema.parse()` is the whole point — a bare `parse` throws a
 * raw `ZodError`, which Nest has no mapping for and turns into a **500**. Bad input is a 400.
 */
function parse<S extends ZodSchema>(schema: S, value: unknown): TypeOf<S> {
  return new ZodValidationPipe(schema).transform(value) as TypeOf<S>;
}

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
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.MY_SHOWS, {
      userId: req.user.id,
      ...parse(organizerShowsQuerySchema, query),
    });
  }

  @Get(':id')
  getOne(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.GET, {
      userId: req.user.id,
      showId: id,
    });
  }

  @Post()
  create(@Req() req: { user: { id: string } }, @Body() body: unknown) {
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.CREATE, {
      userId: req.user.id,
      dto: parse(createShowSchema, body),
    });
  }

  @Patch(':id')
  update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: unknown) {
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.UPDATE, {
      userId: req.user.id,
      showId: id,
      dto: parse(updateShowSchema, body),
    });
  }

  // The read side of the PUT below. The console seeds its pricing form from this and draws the
  // preview map with it — the buyer's seat map 404s a draft, which is the whole point of it.
  @Get(':id/pricing')
  pricing(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.PRICING, {
      userId: req.user.id,
      showId: id,
    });
  }

  // What still stands between this draft and going on sale. A convenience for the popover — the
  // publish route re-checks the same rules, because this answer is stale the moment it is read.
  @Get(':id/publish-checklist')
  publishChecklist(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.PUBLISH_CHECKLIST, {
      userId: req.user.id,
      showId: id,
    });
  }

  @Post(':id/publish')
  publish(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.PUBLISH, {
      userId: req.user.id,
      showId: id,
    });
  }

  // PUT, not PATCH: the body is the show's whole pricing, and `apps/shows` replaces it wholesale.
  @Put(':id/pricing')
  putPricing(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: unknown) {
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.PUT_PRICING, {
      userId: req.user.id,
      showId: id,
      dto: parse(putPricingSchema, body),
    });
  }

  // The poster itself never passes through here — this hands back a short-lived URL the browser
  // PUTs to MinIO directly, then the client PATCHes the returned `posterUrl` onto the show.
  @Post(':id/poster-upload-url')
  posterUploadUrl(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.POSTER_UPLOAD_URL, {
      userId: req.user.id,
      showId: id,
      dto: parse(posterUploadRequestSchema, body),
    });
  }

  // One pattern, whatever the status: `apps/shows` reads the status and either deletes the draft
  // or cancels the published show, so the client never picks a verb from a stale status.
  @Delete(':id')
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return rpcRequest(this.amqp, ORGANIZER_SHOWS_MESSAGE_PATTERNS.DELETE, {
      userId: req.user.id,
      showId: id,
    });
  }
}
