import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { organizers, shows, type Db } from '@tickethub/db';
import { StorageClient } from '@tickethub/storage';
import type { PosterUploadRequestDto, PosterUploadUrl } from '@tickethub/contracts';

/** Five minutes: long enough for a slow upload, short enough that a leaked URL is worthless. */
const UPLOAD_TTL_SECONDS = 300;

// The only mapping that decides an object's extension. A filename from the client never reaches
// the key, so there is no way to land a `.html` in a public-read bucket.
const EXTENSIONS: Record<PosterUploadRequestDto['contentType'], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Poster uploads go browser → MinIO directly, never through the gateway: a poster is megabytes of
 * image, and proxying it would put that through the RPC path for no gain. What comes back is a
 * signed capability to write one object plus the public URL the client then PATCHes onto the show.
 *
 * Debt: an object whose PATCH never lands is orphaned, and nothing collects it.
 */
@Injectable()
export class OrganizerPosterService {
  constructor(
    private readonly db: Db,
    private readonly storage: StorageClient,
  ) {}

  async posterUploadUrl(
    userId: string,
    showId: string,
    contentType: PosterUploadRequestDto['contentType'],
  ): Promise<PosterUploadUrl> {
    await this.assertOwnedShow(userId, showId);

    // A fresh uuid per upload, so replacing a poster never overwrites the object a published show
    // is currently serving — the swap happens when the PATCH lands, not mid-upload.
    const key = `posters/${showId}/${randomUUID()}.${EXTENSIONS[contentType]}`;

    const uploadUrl = await this.storage.getSignedUploadUrl(key, {
      ttl: UPLOAD_TTL_SECONDS,
      contentType,
    });

    return { uploadUrl, posterUrl: this.storage.publicUrl(key) };
  }

  // 404, never 403 — same rule as every other organizer read: a show that is not yours is a show
  // that does not exist, so an id cannot be probed.
  private async assertOwnedShow(userId: string, showId: string): Promise<void> {
    const [show] = await this.db
      .select({ id: shows.id })
      .from(shows)
      .innerJoin(organizers, eq(organizers.id, shows.organizerId))
      .where(and(eq(shows.id, showId), eq(organizers.userId, userId)))
      .limit(1);

    if (!show) throw new NotFoundException('Show not found');
  }
}
