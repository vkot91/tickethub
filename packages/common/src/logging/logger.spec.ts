import { loggerOptions } from './logger.module';

describe('loggerOptions', () => {
  it('redacts sensitive fields', () => {
    expect(loggerOptions.pinoHttp.redact.paths).toEqual(
      expect.arrayContaining(['req.headers.authorization', 'password', '*.password']),
    );
  });
  it('adds request_id via mixin', () => {
    expect(typeof loggerOptions.pinoHttp.mixin).toBe('function');
    expect(loggerOptions.pinoHttp.mixin()).toHaveProperty('request_id');
  });
});
