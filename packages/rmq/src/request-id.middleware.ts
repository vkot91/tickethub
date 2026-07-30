import { Injectable, type NestMiddleware } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { runWithRequestId } from './request-context';

type Req = { headers: Record<string, string | string[] | undefined> };
type Res = { setHeader: (name: string, value: string) => void };

// Origin of the correlation id. On the HTTP edge (gateway) each request gets an id —
// reused from an inbound x-request-id header or freshly minted — put in ALS so every
// log line (pino mixin) and every outgoing RMQ message (publishStored/rpcRequest) for this
// request share it. Must run before the route handler; it wraps the rest of the chain.
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Req, res: Res, next: () => void): void {
    const header = req.headers['x-request-id'];
    const requestId = (Array.isArray(header) ? header[0] : header) || uuid();

    res.setHeader('x-request-id', requestId);

    runWithRequestId(requestId, next);
  }
}
