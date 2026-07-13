import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { runWithRequestId, getRequestId } from './request-context';

// On the consumer side, restore request_id from the RMQ message headers.
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const rmq = context.switchToRpc().getContext<RmqContext>();
    const headers = rmq?.getMessage?.()?.properties?.headers ?? {};
    const requestId = headers['x-request-id'] ?? getRequestId();
    return runWithRequestId(requestId, () => next.handle());
  }
}
