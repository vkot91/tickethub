import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Roles, ZodValidationPipe } from '@tickethub/common';
import { showStatsQuerySchema, type ShowStatsQuery } from '@tickethub/contracts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { GatewayOrganizerStatsService } from './stats.service';

/** What the recent-orders table shows without scrolling. */
const RECENT_LIMIT = 10;

// Guards on the class, so a route added later is guarded by default rather than public by
// accident. Every number below is scoped to the caller's own shows inside the service.
@Controller('organizer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('organizer')
export class GatewayOrganizerStatsController {
  constructor(private readonly statsService: GatewayOrganizerStatsService) {}

  @Get('stats')
  stats(@Req() req: { user: { id: string } }, @Query() query: unknown) {
    // Through the pipe, not `schema.parse`: a raw ZodError is a 500, and bad input is a 400.
    const parsed = new ZodValidationPipe(showStatsQuerySchema).transform(query) as ShowStatsQuery;

    return this.statsService.stats(req.user.id, parsed);
  }

  @Get('orders/recent')
  recentOrders(@Req() req: { user: { id: string } }) {
    return this.statsService.recentOrders(req.user.id, RECENT_LIMIT);
  }
}
