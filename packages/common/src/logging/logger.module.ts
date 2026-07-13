import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { getRequestId } from '@tickethub/rmq';

export const loggerOptions = {
  pinoHttp: {
    redact: {
      paths: ['req.headers.authorization', 'password', '*.password', '*.card', 'req.body.password'],
      censor: '[redacted]',
    },
    mixin: () => ({ request_id: getRequestId() }),
    // Reuse the ALS correlation id (seeded by RequestIdMiddleware) as pino's req.id,
    // so downstream services correlate on the same id.
    genReqId: () => getRequestId(),
    // Trim the per-request noise: method + url, not the whole header/cookie dump.
    serializers: {
      req: (req: { method: string; url: string }) => ({
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    // Quiet successful requests; keep 4xx/5xx loud.
    customLogLevel: (_req: unknown, res: { statusCode: number }, err: unknown) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Pretty locally, JSON in prod. NODE_ENV is unset in dev, so gate on "not production".
    // Resolve pino-pretty to an absolute path: pnpm hides it from the app's cwd, but it's
    // a direct dep of this package, so require.resolve finds it here.
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : { target: require.resolve('pino-pretty'), options: { singleLine: true } },
  },
};

@Module({ imports: [LoggerModule.forRoot(loggerOptions)], exports: [LoggerModule] })
export class AppLoggerModule {}
