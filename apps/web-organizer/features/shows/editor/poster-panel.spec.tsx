import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '../../../test/render';
import { draftShow, mockGateway, SHOW_ID } from '../../test-gateway';
import { PosterPanel } from './poster-panel';

const UPLOAD_URL = 'http://localhost:9000/posters/abc?X-Amz-Signature=deadbeef';
const POSTER_URL = 'http://localhost:9000/posters/abc';

/** Where the presign answer lands, and what the object PUT went to — the second is not `fetch`,
 *  which is the whole point of the exception to the BFF rule. */
const puts: { url: string; type: string | null }[] = [];

function stubXhr() {
  puts.length = 0;

  class FakeXhr {
    status = 200;
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private url = '';
    private type: string | null = null;

    open(_method: string, url: string) {
      this.url = url;
    }

    setRequestHeader(_name: string, value: string) {
      this.type = value;
    }

    send() {
      puts.push({ url: this.url, type: this.type });
      this.onload?.();
    }
  }

  vi.stubGlobal('XMLHttpRequest', FakeXhr);
}

function posterUpload() {
  return {
    [`/organizer/shows/${SHOW_ID}/poster-upload-url`]: {
      status: 200,
      body: { uploadUrl: UPLOAD_URL, posterUrl: POSTER_URL },
    },
  };
}

function pngFile(sizeBytes = 1024, type = 'image/png', name = 'poster.png') {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

afterEach(() => vi.unstubAllGlobals());

describe('PosterPanel', () => {
  it('presigns, PUTs the file straight to MinIO, then PATCHes the returned posterUrl', async () => {
    const fetchMock = mockGateway(posterUpload());
    stubXhr();

    renderWithQuery(<PosterPanel show={{ ...draftShow, id: SHOW_ID }} />);

    await userEvent.upload(screen.getByLabelText('Poster image'), pngFile());

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true),
    );

    const gatewayCalls = fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method]);

    expect(gatewayCalls).toEqual([
      [`/api/gateway/organizer/shows/${SHOW_ID}/poster-upload-url`, 'POST'],
      [`/api/gateway/organizer/shows/${SHOW_ID}`, 'PATCH'],
    ]);

    // The object itself never touched the BFF, and carried the type the URL was signed for.
    expect(puts).toEqual([{ url: UPLOAD_URL, type: 'image/png' }]);

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ posterUrl: POSTER_URL });
  });

  // The `.gif` half of this rule is `upload-poster.spec.ts`'s: `userEvent.upload` honours the
  // input's `accept`, exactly as the OS picker does, so a gif never reaches the change handler.
  it('rejects a 6 MB image before it asks for an upload URL', async () => {
    const fetchMock = mockGateway(posterUpload());
    stubXhr();

    renderWithQuery(<PosterPanel show={{ ...draftShow, id: SHOW_ID }} />);

    await userEvent.upload(screen.getByLabelText('Poster image'), pngFile(6 * 1024 * 1024));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Upload failed. PNG or JPG, up to 5 MB.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(puts).toEqual([]);
  });

  it('clears an existing poster with an explicit null', async () => {
    const fetchMock = mockGateway();

    renderWithQuery(<PosterPanel show={{ ...draftShow, id: SHOW_ID, posterUrl: POSTER_URL }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove poster' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');

      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ posterUrl: null });
    });
  });

  it('offers no controls on a show that can no longer be edited', () => {
    mockGateway();

    renderWithQuery(<PosterPanel show={{ ...draftShow, posterUrl: POSTER_URL }} readOnly />);

    expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove poster' })).not.toBeInTheDocument();
  });
});
