import { NotFoundException } from '@nestjs/common';

import { getTestDb, seedShowGraph, seedUser, type TestDb } from '@tickethub/db/testing';
import { StorageClient } from '@tickethub/storage';

import { OrganizerPosterService } from './poster.service';

let db: TestDb;
let svc: OrganizerPosterService;

// The real client, not a mock: presigning is offline SigV4, so the key layout and the ttl this
// service is responsible for are assertable straight out of the URL it returns.
const storage = new StorageClient({
  endpoint: 'http://minio:9000',
  publicEndpoint: 'http://localhost:9000',
  accessKey: 'key',
  secretKey: 'secret',
  bucket: 'posters',
});

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerPosterService(db, storage);
});

const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000';

async function seedShow() {
  const seeded = await seedShowGraph(db, { show: { status: 'draft' } });

  return { showId: seeded.show.id, userId: seeded.organizer.userId };
}

describe('OrganizerPosterService.posterUploadUrl', () => {
  it('keys the object under the show, with the extension taken from the content type', async () => {
    const { showId, userId } = await seedShow();

    const { uploadUrl, posterUrl } = await svc.posterUploadUrl(userId, showId, 'image/jpeg');

    // posters/<showId>/<uuid>.jpg — the uuid is why re-uploading never overwrites a poster a
    // published show is already serving.
    expect(new URL(uploadUrl).pathname).toMatch(
      new RegExp(`^/posters/posters/${showId}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(new URL(posterUrl).pathname).toBe(new URL(uploadUrl).pathname);
  });

  it('derives the extension from the content type, never from anything the client names', async () => {
    const { showId, userId } = await seedShow();

    const png = await svc.posterUploadUrl(userId, showId, 'image/png');
    const webp = await svc.posterUploadUrl(userId, showId, 'image/webp');

    expect(new URL(png.uploadUrl).pathname).toMatch(/\.png$/);
    expect(new URL(webp.uploadUrl).pathname).toMatch(/\.webp$/);
  });

  it('hands back a signed upload URL and an unsigned poster URL', async () => {
    const { showId, userId } = await seedShow();

    const { uploadUrl, posterUrl } = await svc.posterUploadUrl(userId, showId, 'image/png');

    expect(new URL(uploadUrl).searchParams.get('X-Amz-Expires')).toBe('300');
    expect(new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(new URL(posterUrl).search).toBe('');
  });

  it('never mints a URL for a show that is not the caller’s', async () => {
    // A 404 rather than a 403: an organizer must not be able to probe for a competitor's show id,
    // and an upload URL for it would be a write capability on someone else's row.
    const { showId } = await seedShow();
    const stranger = await seedUser(db);

    await expect(svc.posterUploadUrl(stranger.id, showId, 'image/png')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('404s on a show that does not exist', async () => {
    const { userId } = await seedShow();

    await expect(svc.posterUploadUrl(userId, UNKNOWN_ID, 'image/png')).rejects.toThrow(
      NotFoundException,
    );
  });
});
