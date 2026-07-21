import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { isRabbitContext } from '@golevelup/nestjs-rabbitmq';
import { Observable } from 'rxjs';
import { runWithRequestId, getRequestId } from './request-context';

// The one field of the AMQP ConsumeMessage we read — avoids depending on @types/amqplib.
type AmqpMsg = { properties?: { headers?: Record<string, unknown> } };

// On the consumer side, restore request_id from the AMQP message headers. golevelup passes
// the raw ConsumeMessage as the handler's 2nd arg, so it sits at arg index 1 on the context.
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!isRabbitContext(context)) return next.handle();

    const amqpMsg = context.getArgByIndex<AmqpMsg | undefined>(1);
    const requestId = (amqpMsg?.properties?.headers?.['x-request-id'] as string) ?? getRequestId();

    return runWithRequestId(requestId, () => next.handle());
  }
}
