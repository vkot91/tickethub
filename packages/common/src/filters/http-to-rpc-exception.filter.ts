import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { throwError, type Observable } from 'rxjs';

// Microservice side: Nest's default BaseRpcExceptionFilter collapses any non-RpcException
// (including HttpExceptions like Conflict/NotFound) to `{ status: 'error', message: 'Internal
// server error' }`, so the gateway can't recover the real code and answers 500. Re-emit the
// error as a flat `{ status, message }` — the exact shape the gateway's RpcToHttpExceptionFilter
// reads `err.status` from. (Wrapping in RpcException nests it under `err.error`, losing the status.)
@Catch(HttpException)
export class HttpToRpcExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, _host: ArgumentsHost): Observable<never> {
    return throwError(() => ({ status: exception.getStatus(), message: exception.message }));
  }
}
