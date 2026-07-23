import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigService } from '@tickethub/config';
import { createDb, type Db } from './client';

// The 'DB' provider every service used to hand-roll. Global so any provider can inject 'DB'
// without importing this module. Kept in the `/nest` subpath so the Nest-free root (drizzle-kit,
// seed) never pulls @nestjs/common.
@Global()
@Module({})
export class DbModule {
  static forRoot(): DynamicModule {
    return {
      module: DbModule,
      providers: [
        {
          provide: 'DB',
          inject: [ConfigService],
          useFactory: (config: ConfigService): Db =>
            createDb(config.getOrThrow<string>('DATABASE_URL')),
        },
      ],
      exports: ['DB'],
    };
  }
}
