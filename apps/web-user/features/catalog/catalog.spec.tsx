import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type ShowSummary } from '@tickethub/contracts';
import { ShowStatusPill } from '@tickethub/ui';

import { renderWithQuery } from '@/test/render';

import { CatalogGrid } from './catalog-grid';
import { FeaturedShow } from './featured-show';
import { ShowCard } from './show-card';

function makeShow(overrides: Partial<ShowSummary> = {}): ShowSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Demo Concert',
    startsAt: '2026-08-14T20:00:00.000Z',
    posterUrl: null,
    status: 'published',
    ...overrides,
  };
}

function mockPages(...pages: unknown[]) {
  const fetchMock = vi.fn();

  for (const page of pages) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(page)),
    } as unknown as Response);
  }

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ShowStatusPill', () => {
  it.each([
    ['published', 'On sale'],
    ['cancelled', 'Cancelled'],
    ['draft', 'Draft'],
    ['finished', 'Finished'],
  ] as const)('labels %s as "%s"', (status, label) => {
    render(<ShowStatusPill status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('ShowCard', () => {
  it('links to the show and shows its date and status', () => {
    render(<ShowCard show={makeShow()} />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/shows/11111111-1111-4111-8111-111111111111',
    );
    expect(screen.getByText('14 Aug')).toBeInTheDocument();
    expect(screen.getByText('On sale')).toBeInTheDocument();
  });
});

describe('FeaturedShow', () => {
  it('sends the primary call to action straight to seat selection', () => {
    render(<FeaturedShow show={makeShow()} />);

    expect(screen.getByRole('link', { name: 'Choose seats →' })).toHaveAttribute(
      'href',
      '/shows/11111111-1111-4111-8111-111111111111/seats',
    );
  });
});

describe('CatalogGrid', () => {
  it('appends the next page instead of replacing the first', async () => {
    const second = makeShow({ id: '22222222-2222-4222-8222-222222222222', title: 'Night Two' });

    mockPages(
      { items: [makeShow()], nextCursor: second.id },
      { items: [second], nextCursor: null },
    );

    renderWithQuery(<CatalogGrid />);

    expect(await screen.findByRole('heading', { name: 'Demo Concert' })).toBeInTheDocument();
    expect(screen.getByText('1 result')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: 'Night Two' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Demo Concert' })).toBeInTheDocument();
    expect(screen.getByText('2 results')).toBeInTheDocument();
  });

  it('hides the load-more button on the last page', async () => {
    mockPages({ items: [makeShow()], nextCursor: null });

    renderWithQuery(<CatalogGrid />);

    await screen.findByRole('heading', { name: 'Demo Concert' });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('says so when nothing is on sale', async () => {
    mockPages({ items: [], nextCursor: null });

    renderWithQuery(<CatalogGrid />);

    await waitFor(() =>
      expect(screen.getByText('No shows on sale right now. Check back soon.')).toBeInTheDocument(),
    );
  });
});
