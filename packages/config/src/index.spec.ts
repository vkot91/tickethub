import { z } from 'zod';
import { configModuleFor, loadEnv, requireEnv } from './index';

describe('configModuleFor', () => {
  const schema = z.object({ FOO: z.string() });
  afterEach(() => delete process.env.FOO);

  it('builds a global ConfigModule when process.env satisfies the schema', async () => {
    process.env.FOO = 'bar';
    const mod = await configModuleFor(schema);
    expect(mod.global).toBe(true);
  });

  it('aborts boot (rejects) when process.env is invalid', async () => {
    delete process.env.FOO;
    await expect(configModuleFor(schema)).rejects.toThrow();
  });
});

// The package re-exports @tickethub/env so apps import all config from one place.
describe('re-exported env helpers', () => {
  afterEach(() => delete process.env.FOO);

  it('reads a present var via requireEnv (loadEnv is idempotent)', () => {
    loadEnv();
    process.env.FOO = 'bar';
    expect(requireEnv('FOO')).toBe('bar');
  });

  it('throws via requireEnv when the var is missing', () => {
    delete process.env.FOO;
    expect(() => requireEnv('FOO')).toThrow();
  });
});
