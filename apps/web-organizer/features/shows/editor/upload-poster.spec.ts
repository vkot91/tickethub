import { describe, expect, it, vi } from 'vitest';

import { POSTER_REJECTED, posterRejection, putPoster } from './upload-poster';

function file(bytes: number, type: string) {
  return new File([new Uint8Array(bytes)], 'poster', { type });
}

describe('posterRejection', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts a small %s', (type) => {
    expect(posterRejection(file(1024, type))).toBeUndefined();
  });

  it.each([
    ['a type MinIO will not sign for', file(1024, 'image/gif')],
    ['anything over 5 MB', file(6 * 1024 * 1024, 'image/png')],
  ])('rejects %s with the one message the design gives', (_label, rejected) => {
    expect(posterRejection(rejected)).toBe(POSTER_REJECTED);
  });

  it('accepts a file exactly on the 5 MB line', () => {
    expect(posterRejection(file(5 * 1024 * 1024, 'image/png'))).toBeUndefined();
  });
});

/** A hand-rolled XHR, because jsdom's would try to reach MinIO for real. */
function fakeXhr(status: number) {
  const instance = {
    status,
    upload: { onprogress: null as ((event: ProgressEvent) => void) | null },
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(() => {
      instance.upload.onprogress?.({
        lengthComputable: true,
        loaded: 50,
        total: 200,
      } as ProgressEvent);
      instance.onload?.();
    }),
  };

  vi.stubGlobal(
    'XMLHttpRequest',
    vi.fn(() => instance),
  );

  return instance;
}

describe('putPoster', () => {
  it('PUTs the file with the content type the URL was signed for, reporting progress', async () => {
    const request = fakeXhr(200);
    const onProgress = vi.fn();

    await putPoster('http://minio/posters/abc?sig=1', file(10, 'image/png'), onProgress);

    expect(request.open).toHaveBeenCalledWith('PUT', 'http://minio/posters/abc?sig=1');
    expect(request.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(onProgress).toHaveBeenCalledWith(25);

    vi.unstubAllGlobals();
  });

  it('rejects on a status MinIO refuses the signature with', async () => {
    fakeXhr(403);

    await expect(putPoster('http://minio/x', file(10, 'image/png'), vi.fn())).rejects.toThrow(
      'Upload failed (403)',
    );

    vi.unstubAllGlobals();
  });
});
