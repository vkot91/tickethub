import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@tickethub/config';
import { createTransport } from 'nodemailer';
import { z } from 'zod';
import { Mailer } from './mailer';

/**
 * Spread into an app's own Zod schema so the env contract lives with the code that reads it:
 * `z.object({ ...mailerEnvSchema.shape, DATABASE_URL: z.string() })`.
 */
export const mailerEnvSchema = z.object({
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().int(),
  MAIL_FROM: z.string(),
});

export type MailerEnv = z.infer<typeof mailerEnvSchema>;

type MailerConfigService = ConfigService<MailerEnv, true>;

@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [ConfigService],
      useFactory: (config: MailerConfigService) => {
        const get = <K extends keyof MailerEnv>(key: K) => config.get(key, { infer: true });

        // ponytail: no SMTP auth — Mailpit locally needs none. Add `auth` here (and two optional
        // env vars) the day a real provider is wired in.
        const transporter = createTransport({
          host: get('SMTP_HOST'),
          port: get('SMTP_PORT'),
          secure: false,
        });

        return new Mailer(transporter, get('MAIL_FROM'));
      },
    },
  ],
  exports: [Mailer],
})
export class MailerModule {}
