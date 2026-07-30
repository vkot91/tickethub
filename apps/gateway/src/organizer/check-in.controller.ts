import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Roles, ZodValidationPipe } from '@tickethub/common';
import { checkInSchema, type CheckInDto } from '@tickethub/contracts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { OrganizerCheckInService } from './check-in.service';

/**
 * The gate scanner. Guards on the class, so a route added later is guarded by default rather than
 * public by accident.
 *
 * Its own controller rather than a route on `stats.controller.ts`: a scan is a write, and the file
 * is the resource.
 */
@Controller('organizer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('organizer')
export class GatewayOrganizerCheckInController {
  constructor(private readonly checkInService: OrganizerCheckInService) {}

  // 200, not Nest's POST default of 201: a scan creates no resource, and a rejected one — or a
  // second scan of the same seat — creates nothing at all. The verdict is the whole response.
  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  checkIn(@Req() req: { user: { id: string } }, @Body() body: unknown) {
    // Through the pipe, not `schema.parse`: a raw ZodError is a 500, and bad input is a 400.
    const dto = new ZodValidationPipe(checkInSchema).transform(body) as CheckInDto;

    return this.checkInService.checkIn(req.user.id, dto);
  }
}
