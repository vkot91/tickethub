import { POSTER_CONTENT_TYPES } from '@tickethub/contracts';

export const MAX_POSTER_BYTES = 5 * 1024 * 1024;

/** The design's one message for both rejections — the organizer does not need to know which of
 *  the two rules they broke, they need to know what to drop instead. */
export const POSTER_REJECTED = 'Upload failed. PNG or JPG, up to 5 MB.';

/** Client-side only, and deliberately so: the *type* is enforced again by the presigned URL's
 *  signature, and the size cap is bandwidth the organizer pays for themselves. */
export function posterRejection(file: File): string | undefined {
  const isAllowedType = (POSTER_CONTENT_TYPES as readonly string[]).includes(file.type);

  return isAllowedType && file.size <= MAX_POSTER_BYTES ? undefined : POSTER_REJECTED;
}

/**
 * The one request in this app that leaves for a non-gateway origin. `XMLHttpRequest` rather than
 * `fetch` because `fetch` reports no upload progress, and a poster on a venue's wifi is long
 * enough to need a bar.
 */
export function putPoster(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('PUT', uploadUrl);
    // Must match the type the URL was signed for, or MinIO rejects the signature.
    request.setRequestHeader('Content-Type', file.type);

    request.upload.onprogress = (progress) => {
      if (progress.lengthComputable)
        onProgress(Math.round((progress.loaded / progress.total) * 100));
    };

    request.onload = () =>
      request.status < 400 ? resolve() : reject(new Error(`Upload failed (${request.status})`));

    request.onerror = () => reject(new Error('Upload failed'));

    request.send(file);
  });
}
