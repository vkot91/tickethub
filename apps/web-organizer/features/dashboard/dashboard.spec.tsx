import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { mockGateway, recentOrders, SHOW_ID, stats } from '../test-gateway';
import { Dashboard } from './dashboard';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function statsCalls(fetchMock: ReturnType<typeof mockGateway>): string[] {
  return fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('/organizer/stats'));
}

describe('Dashboard', () => {
  it('asks an organizer with no shows to create one, instead of four zeroed cards', async () => {
    mockGateway({ '/organizer/shows': { status: 200, body: [] } });
    renderWithQuery(<Dashboard />);

    expect(
      await screen.findByText('Create your first show to see sales here.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New show' })).toHaveAttribute('href', '/shows');
    expect(screen.queryByText('TICKETS SOLD')).not.toBeInTheDocument();
  });

  it('shows sales, revenue, refunds and check-ins across every show by default', async () => {
    const fetchMock = mockGateway();
    renderWithQuery(<Dashboard />);

    const soldCard = (await screen.findByText('TICKETS SOLD')).closest('div')!;

    expect(within(soldCard).getByText('120')).toBeInTheDocument();
    expect(within(soldCard).getByText('of 400 seats')).toBeInTheDocument();
    expect(screen.getByText('$24,000')).toBeInTheDocument();

    const checkedInCard = screen.getByText('CHECKED IN').closest('div')!;

    expect(within(checkedInCard).getByText('64')).toBeInTheDocument();
    expect(within(checkedInCard).getByText('of 120 sold')).toBeInTheDocument();

    expect(statsCalls(fetchMock)[0]).not.toContain('showId');
  });

  it('renders no delta line — the contract has no comparable previous range', async () => {
    mockGateway();
    renderWithQuery(<Dashboard />);

    await screen.findByText('TICKETS SOLD');

    expect(screen.queryByText(/vs (last|previous)/i)).not.toBeInTheDocument();
  });

  it('paints the Refunded card amber only when something was refunded', async () => {
    mockGateway();
    const { unmount } = renderWithQuery(<Dashboard />);

    // Scoped to the card: the chart labels a bar "$1,000" too.
    const refunded = (await screen.findByText('REFUNDED')).closest('div')!;

    expect(within(refunded).getByText('$1,000')).toHaveClass('text-warn');

    unmount();
    vi.unstubAllGlobals();

    mockGateway({ '/organizer/stats': { status: 200, body: { ...stats, refundedCents: 0 } } });
    renderWithQuery(<Dashboard />);

    const zeroed = (await screen.findByText('REFUNDED')).closest('div')!;

    expect(within(zeroed).getByText('$0')).not.toHaveClass('text-warn');
  });

  it('defaults to the last 30 days and sends the range as an explicit `from`', async () => {
    const fetchMock = mockGateway();
    renderWithQuery(<Dashboard />);

    await screen.findByText('TICKETS SOLD');

    expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('Last 30 days');
    expect(statsCalls(fetchMock)[0]).toMatch(/from=\d{4}-\d{2}-\d{2}T/);
  });

  it('refetches with a new `from` and puts the range in the URL when it changes', async () => {
    const fetchMock = mockGateway();
    renderWithQuery(<Dashboard />);

    await screen.findByText('TICKETS SOLD');

    await userEvent.click(screen.getByRole('combobox', { name: 'Range' }));
    await userEvent.click(await screen.findByRole('option', { name: 'All time' }));

    await waitFor(() => expect(statsCalls(fetchMock).length).toBeGreaterThan(1));

    expect(statsCalls(fetchMock).at(-1)).toContain('from=2020-01-01T00%3A00%3A00.000Z');
    expect(replace).toHaveBeenCalledWith('/?range=all', { scroll: false });
  });

  it('scopes to one show and writes it to the URL', async () => {
    const fetchMock = mockGateway();
    renderWithQuery(<Dashboard />);

    await screen.findByText('TICKETS SOLD');

    await userEvent.click(screen.getByRole('combobox', { name: 'Show' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Demo Concert' }));

    await waitFor(() => expect(statsCalls(fetchMock).at(-1)).toContain(`showId=${SHOW_ID}`));

    expect(replace).toHaveBeenCalledWith(`/?showId=${SHOW_ID}`, { scroll: false });
  });

  it('seeds both selections from the URL', async () => {
    const fetchMock = mockGateway();
    renderWithQuery(<Dashboard showId={SHOW_ID} range="7d" />);

    await screen.findByText('TICKETS SOLD');

    expect(statsCalls(fetchMock)[0]).toContain(`showId=${SHOW_ID}`);
    expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent('Last 7 days');
  });

  it('hides the price-bands card across all shows and shows it for one', async () => {
    mockGateway();
    const { unmount } = renderWithQuery(<Dashboard />);

    await screen.findByText('TICKETS SOLD');

    expect(screen.queryByRole('heading', { name: 'Price bands' })).not.toBeInTheDocument();

    unmount();

    renderWithQuery(<Dashboard showId={SHOW_ID} />);

    expect(await screen.findByRole('heading', { name: 'Price bands' })).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Front VIP — 90 of 120 sold' }),
    ).toBeInTheDocument();
  });

  it('falls back to all shows when a stale `showId` 404s, rather than rendering an error', async () => {
    const fetchMock = mockGateway({ '/organizer/stats?showId': { status: 404, body: {} } });
    renderWithQuery(<Dashboard showId={SHOW_ID} />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/', { scroll: false }));

    expect(await screen.findByText('TICKETS SOLD')).toBeInTheDocument();
    expect(statsCalls(fetchMock).at(-1)).not.toContain('showId');
  });

  it('draws a bar per day with an accessible label', async () => {
    mockGateway();
    renderWithQuery(<Dashboard />);

    expect(
      await screen.findByRole('img', { name: '2026-08-02: $3,000 from 11 orders' }),
    ).toBeInTheDocument();
  });

  it('lists recent orders with buyer and seats', async () => {
    mockGateway();
    renderWithQuery(<Dashboard />);

    expect(await screen.findByText('buyer@example.com')).toBeInTheDocument();
    expect(screen.getByText('A1, A2')).toBeInTheDocument();
  });

  it('keeps an order whose buyer is gone, as "Unknown buyer" — the money still happened', async () => {
    mockGateway({
      '/organizer/orders/recent': {
        status: 200,
        body: { items: [{ ...recentOrders.items[0], buyerEmail: null }] },
      },
    });
    renderWithQuery(<Dashboard />);

    expect(await screen.findByText('Unknown buyer')).toBeInTheDocument();
    expect(screen.getByText('A1, A2')).toBeInTheDocument();
  });
});
