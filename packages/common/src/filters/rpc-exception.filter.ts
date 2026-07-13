import { Catch, ArgumentsHost, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

// Maps errors bubbling up from RPC calls into HTTP responses at the gateway.
@Catch()
export class RpcToHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      return res.status(exception.getStatus()).json(exception.getResponse());
    }
    const err = exception as { status?: number; message?: string };
    const status = typeof err?.status === 'number' ? err.status : HttpStatus.INTERNAL_SERVER_ERROR;
    res.status(status).json({ statusCode: status, message: err?.message ?? 'Internal error' });
  }
}
