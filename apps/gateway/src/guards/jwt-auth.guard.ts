import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { AUTH_MESSAGE_PATTERNS } from '@tickethub/contracts';
import { rpcRequest } from '@tickethub/rmq';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly amqp: AmqpConnection) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    if (!token) throw new UnauthorizedException();
    try {
      req.user = await rpcRequest(this.amqp, AUTH_MESSAGE_PATTERNS.VALIDATE, {
        accessToken: token,
      });
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
