import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '../../../test/render';
import { draftShow, mockGateway, publishedShow, SHOW_ID } from '../../test-gateway';
import { ShowEditor } from './show-editor';

// `next/navigation` is deliberately not mocked here: pnpm resolves `packages/ui`'s copy through
// its own symlink, so a mock declared in this app would not reach `NavTabs` anyway. Which tab it
// marks current is pinned in `packages/ui`'s own spec; this file tests the frame around it.

function withShow(show: unknown) {
  return mockGateway({ [`/organizer/shows/${SHOW_ID}`]: { status: 200, body: show } });
}

afterEach(() => vi.unstubAllGlobals());

describe('ShowEditor', () => {
  it('explains what a published show still lets you edit', async () => {
    withShow(publishedShow);

    renderWithQuery(<ShowEditor showId={SHOW_ID} />);

    expect(await screen.findByText(/This show is on sale/)).toBeInTheDocument();
    // Publishing is a draft's action; a show already on sale has no button for it.
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('renders a cancelled show read-only, under the refund banner', async () => {
    withShow({ ...publishedShow, status: 'cancelled' });

    renderWithQuery(<ShowEditor showId={SHOW_ID} />);

    expect(await screen.findByText(/all paid orders were refunded/)).toBeInTheDocument();
    expect(await screen.findByLabelText('Title')).toBeDisabled();
  });

  it('offers Publish on a draft, inert until the next slice wires it', async () => {
    withShow({ ...draftShow, id: SHOW_ID });

    renderWithQuery(<ShowEditor showId={SHOW_ID} />);

    expect(await screen.findByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.queryByText(/on sale/)).not.toBeInTheDocument();
  });

  it('shows Details when no tab is named', async () => {
    withShow({ ...draftShow, id: SHOW_ID });

    renderWithQuery(<ShowEditor showId={SHOW_ID} />);

    expect(await screen.findByLabelText('Title')).toBeInTheDocument();
  });

  it('swaps the panel for the tab named in ?tab=', async () => {
    withShow({ ...draftShow, id: SHOW_ID });

    renderWithQuery(<ShowEditor showId={SHOW_ID} tab="pricing" />);

    expect(await screen.findByText(/Pricing lands in the next slice/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });
});
