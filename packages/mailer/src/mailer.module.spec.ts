import 'reflect-metadata';
import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@tickethub/config';
import type { Transporter, TransportOptions } from 'nodemailer';

const createTransportMock = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: (options: TransportOptions) => createTransportMock(options) as Transporter,
}));

// Imported through the package entry, not the modules directly: this is the surface consumers
// actually get, so a barrel that stops re-exporting something fails here.
import { MailerModule, mailerEnvSchema, Mailer, type MailerEnv } from './index';

const providers = Reflect.getMetadata('providers', MailerModule) as FactoryProvider[];
const provider = providers.find((candidate) => candidate.provide === Mailer)!;

const configServiceFor = (env: MailerEnv) =>
  ({ get: (key: keyof MailerEnv) => env[key] }) as unknown as ConfigService<MailerEnv, true>;

const env: MailerEnv = {
  SMTP_HOST: 'mailpit',
  SMTP_PORT: 1025,
  MAIL_FROM: 'tickets@tickethub.test',
};

describe('MailerModule', () => {
  beforeEach(() => createTransportMock.mockReset().mockReturnValue({ sendMail: jest.fn() }));

  it('builds the transport from the importing app’s ConfigService', () => {
    expect(provider.inject).toEqual([ConfigService]);

    const mailer = provider.useFactory(configServiceFor(env));

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'mailpit',
      port: 1025,
      secure: false,
    });
    expect(mailer).toBeInstanceOf(Mailer);
  });

  it('binds the configured from address', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    createTransportMock.mockReturnValue({ sendMail });

    const mailer: Mailer = provider.useFactory(configServiceFor(env));

    await mailer.send({ to: 'buyer@example.com', subject: 's', html: '<p>h</p>' });

    expect(sendMail.mock.calls[0][0].from).toBe('tickets@tickethub.test');
  });

  it('exports the mailer', () => {
    expect(Reflect.getMetadata('exports', MailerModule)).toEqual([Mailer]);
  });
});

describe('mailerEnvSchema', () => {
  it('coerces the port from its string env value', () => {
    const parsed = mailerEnvSchema.parse({
      SMTP_HOST: 'mailpit',
      SMTP_PORT: '1025',
      MAIL_FROM: 'tickets@tickethub.test',
    });

    expect(parsed.SMTP_PORT).toBe(1025);
  });

  it('refuses to boot without a from address', () => {
    expect(() => mailerEnvSchema.parse({ SMTP_HOST: 'mailpit', SMTP_PORT: '1025' })).toThrow();
  });
});
