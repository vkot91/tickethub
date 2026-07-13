import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { MESSAGE_PATTERNS } from '@tickethub/contracts';
import { RPC } from '../tokens';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(RPC.auth) private readonly auth: ClientProxy) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    if (!token) throw new UnauthorizedException();
    try {
      req.user = await firstValueFrom(
        this.auth.send(MESSAGE_PATTERNS.auth.validate, { accessToken: token }),
      );
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
