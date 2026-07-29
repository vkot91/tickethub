import { StorageClient } from './storage.client';

// Deliberately NOT mocking @aws-sdk/client-s3 here: presigning is a pure local SigV4 computation
// that never opens a socket, so the real SDK produces a real signature offline. Every property
// worth protecting — the signed host, the expiry, the download filename — is assertable from the
// returned string, which is also where these bugs actually live.
describe('StorageClient.getSignedUrl', () => {
  const config = {
    endpoint: 'http://minio:9000',
    publicEndpoint: 'http://localhost:9000',
    accessKey: 'key',
    secretKey: 'secret',
    bucket: 'tickets',
  };

  const signedUrl = (overrides: Partial<typeof config> = {}) =>
    new StorageClient({ ...config, ...overrides }).getSignedUrl('order-1.pdf', {
      ttl: 60,
      filename: 'ticket-order-1.pdf',
    });

  it('signs against the browser-reachable host, not the in-cluster one', async () => {
    // The whole point of publicEndpoint: SigV4 covers `host`, so a URL signed against
    // `minio:9000` hands the browser a hostname that resolves to nothing and cannot be
    // rewritten without invalidating the signature.
    const url = new URL(await signedUrl());

    expect(url.host).toBe('localhost:9000');
    expect(url.pathname).toBe('/tickets/order-1.pdf');
  });

  it('carries the requested ttl as the expiry', async () => {
    const url = new URL(await signedUrl());

    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
  });

  it('asks S3 to serve the object as a named attachment', async () => {
    const url = new URL(await signedUrl());

    expect(url.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="ticket-order-1.pdf"',
    );
  });

  it('produces a complete SigV4 signature', async () => {
    const url = new URL(await signedUrl());

    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(url.searchParams.get('X-Amz-Credential')).toContain('key/');
  });

  it('omits the content-disposition when no filename is given', async () => {
    const url = new URL(await new StorageClient(config).getSignedUrl('order-1.pdf', { ttl: 60 }));

    expect(url.searchParams.get('response-content-disposition')).toBeNull();
  });

  it('falls back to the in-cluster endpoint when no public one is configured', async () => {
    const url = new URL(await signedUrl({ publicEndpoint: undefined }));

    expect(url.host).toBe('minio:9000');
  });
});

// Same offline-signing rationale as above: the upload URL is a capability string, and everything
// that makes it safe — the host, the expiry, the content type it pins the object to — is readable
// straight out of the query string.
describe('StorageClient.getSignedUploadUrl', () => {
  const config = {
    endpoint: 'http://minio:9000',
    publicEndpoint: 'http://localhost:9000',
    accessKey: 'key',
    secretKey: 'secret',
    bucket: 'posters',
  };

  const uploadUrl = (contentType = 'image/png') =>
    new StorageClient(config).getSignedUploadUrl('show-1/abc.png', { ttl: 300, contentType });

  it('signs against the browser-reachable host — the browser is what PUTs here', async () => {
    const url = new URL(await uploadUrl());

    expect(url.host).toBe('localhost:9000');
    expect(url.pathname).toBe('/posters/show-1/abc.png');
  });

  it('covers the content type in the signature', async () => {
    // Without content-type among the signed headers the URL stops being "store one PNG here" and
    // becomes "store anything here" — a script uploaded under an image key, served from a
    // public-read bucket.
    const url = new URL(await uploadUrl());

    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
  });

  it('carries the requested ttl as the expiry', async () => {
    const url = new URL(await uploadUrl());

    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('gives the plain public URL of the same key, with no signature on it', async () => {
    // What the client PATCHes onto the show. A signed URL here would rot after the ttl and leave
    // the show pointing at a 403.
    const url = new URL(new StorageClient(config).publicUrl('show-1/abc.png'));

    expect(url.host).toBe('localhost:9000');
    expect(url.pathname).toBe('/posters/show-1/abc.png');
    expect(url.search).toBe('');
  });

  it('signs a different content type differently', async () => {
    const [png, webp] = await Promise.all([uploadUrl('image/png'), uploadUrl('image/webp')]);

    expect(new URL(png).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(webp).searchParams.get('X-Amz-Signature'),
    );
  });
});
