import { Catch, ArgumentsHost, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

// Maps errors bubbling up from RPC calls into HTTP responses at the gateway.
@Catch()
export class RpcToHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // `new HttpException('some message', status)` — which is how rpcRequest rethrows a
      // service's error — returns that bare string from getResponse(), so sending it as-is
      // makes the body a naked JSON string with no `message` for clients to read. Normalize
      // to the same `{ statusCode, message }` shape Nest's built-in exceptions produce.
      return res
        .status(status)
        .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
    }
    const err = exception as { status?: number; message?: string };
    const status = typeof err?.status === 'number' ? err.status : HttpStatus.INTERNAL_SERVER_ERROR;
    res.status(status).json({ statusCode: status, message: err?.message ?? 'Internal error' });
  }
}
