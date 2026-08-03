import { FactoryProvider } from '@nestjs/common';

import { ConfigService } from '@tickethub/config';

import { DbModule } from './nest';

describe('DbModule', () => {
  it('wires a global DB provider from DATABASE_URL', () => {
    const def = DbModule.forRoot();
    const provider = (def.providers as FactoryProvider[]).find((p) => p.provide === 'DB')!;

    const config = { getOrThrow: () => 'postgres://localhost/test' } as unknown as ConfigService;
    const db = provider.useFactory(config);

    expect(db).toBeDefined();
    expect(def.exports).toContain('DB');
  });
});
