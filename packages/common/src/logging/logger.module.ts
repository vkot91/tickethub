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
    // Pretty locally, JSON in prod, and always ship to Loki. NODE_ENV is unset in dev, so
    // gate on "not production". Resolve every transport to an absolute path: pnpm hides them
    // from the app's cwd, but they're direct deps of this package, so require.resolve finds
    // them here (pino spawns a worker that re-requires the target by string).
    transport: {
      targets: [
        process.env.NODE_ENV === 'production'
          ? { target: require.resolve('pino/file'), options: { destination: 1 } } // raw JSON to stdout
          : { target: require.resolve('pino-pretty'), options: { singleLine: true } },
        {
          // Apps run on the host, so Promtail's docker_sd can't see them — push straight to Loki.
          // Service label comes from npm_package_name (pnpm sets it for every `pnpm --filter … dev`),
          // so no per-app start-script wiring. silenceErrors keeps dev alive when Loki is down.
          // ponytail: pino-loki push over Promtail-file — no containerizing apps, no log files on disk.
          target: require.resolve('pino-loki'),
          options: {
            host: process.env.LOKI_URL ?? 'http://localhost:3100',
            labels: { service: process.env.npm_package_name?.split('/').pop() ?? 'app' },
            batching: true,
            interval: 5,
            silenceErrors: true,
          },
        },
      ],
    },
  },
};

@Module({ imports: [LoggerModule.forRoot(loggerOptions)], exports: [LoggerModule] })
export class AppLoggerModule {}
