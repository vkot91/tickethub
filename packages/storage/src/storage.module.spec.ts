import 'reflect-metadata';
import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@tickethub/config';
// Imported through the package entry, not the modules directly: this is the surface consumers
// actually get, so a barrel that stops re-exporting something fails here.
import { StorageModule, storageEnvSchema, StorageClient } from './index';

const definition = StorageModule.forBucket('S3_BUCKET_TICKETS');
const provider = (definition.providers as FactoryProvider[]).find(
  (candidate) => candidate.provide === StorageClient,
)!;

const configServiceFor = (env: Record<string, string>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService<never, true>;

const env = {
  S3_ENDPOINT: 'http://minio:9000',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET_TICKETS: 'tickets',
};

describe('StorageModule.forBucket', () => {
  it('builds the client from the importing app’s ConfigService', () => {
    expect(provider.inject).toEqual([ConfigService]);
    expect(provider.useFactory(configServiceFor(env))).toBeInstanceOf(StorageClient);
  });

  // One local .env serves every service, so a generic S3_BUCKET could hold only one value —
  // each app names its own key and gets its own bucket.
  it('reads the bucket from the env key the app named', async () => {
    const client: StorageClient = provider.useFactory(
      configServiceFor({ ...env, S3_BUCKET_POSTERS: 'posters' }),
    );

    const url = new URL(await client.getSignedUrl('order-1.pdf', { ttl: 60 }));

    expect(url.pathname).toBe('/tickets/order-1.pdf');
  });

  it('lets a second consumer point at a different bucket', async () => {
    const postersProvider = (
      StorageModule.forBucket('S3_BUCKET_POSTERS').providers as FactoryProvider[]
    ).find((candidate) => candidate.provide === StorageClient)!;

    const client: StorageClient = postersProvider.useFactory(
      configServiceFor({ ...env, S3_BUCKET_POSTERS: 'posters' }),
    );

    const url = new URL(await client.getSignedUrl('poster.png', { ttl: 60 }));

    expect(url.pathname).toBe('/posters/poster.png');
  });

  it('passes the public endpoint through so signed URLs are browser-reachable', async () => {
    const client: StorageClient = provider.useFactory(
      configServiceFor({ ...env, S3_PUBLIC_ENDPOINT: 'http://localhost:9000' }),
    );

    const url = new URL(await client.getSignedUrl('order-1.pdf', { ttl: 60 }));

    expect(url.host).toBe('localhost:9000');
  });

  it('is global so a consuming app imports it once', () => {
    expect(definition.global).toBe(true);
    expect(definition.exports).toEqual([StorageClient]);
  });
});

describe('storageEnvSchema', () => {
  const valid = {
    S3_ENDPOINT: 'http://minio:9000',
    S3_ACCESS_KEY: 'key',
    S3_SECRET_KEY: 'secret',
  };

  it('accepts a config without the optional public endpoint', () => {
    expect(storageEnvSchema.parse(valid).S3_PUBLIC_ENDPOINT).toBeUndefined();
  });

  it('leaves the bucket to the app, which names its own key', () => {
    expect(Object.keys(storageEnvSchema.shape)).not.toContain('S3_BUCKET');
  });

  it('refuses to boot without credentials', () => {
    expect(() => storageEnvSchema.parse({ ...valid, S3_SECRET_KEY: undefined })).toThrow();
  });
});
