import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { mockGateway } from '../test-gateway';
import { ShowsScreen } from './shows-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ShowsScreen', () => {
  it('lists the organizer’s shows', async () => {
    mockGateway();
    renderWithQuery(<ShowsScreen />);

    expect(await screen.findByText('Demo Concert')).toBeInTheDocument();
    expect(screen.getByText('Neon Nights')).toBeInTheDocument();
  });

  it('asks the gateway for the status in the URL, and keys the query by it', async () => {
    const fetchMock = mockGateway();
    renderWithQuery(<ShowsScreen status="draft" />);

    await screen.findByText('Demo Concert');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gateway/organizer/shows?status=draft',
      expect.anything(),
    );
  });

  it('renders the empty state without an "add a venue first" branch', async () => {
    mockGateway({ '/organizer/shows': { status: 200, body: [] } });
    renderWithQuery(<ShowsScreen />);

    expect(await screen.findByRole('heading', { name: 'No shows yet' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New show' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/add a venue/i)).not.toBeInTheDocument();
  });

  it('confirms a draft delete with copy that names the draft', async () => {
    mockGateway();
    renderWithQuery(<ShowsScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete draft' }));

    expect(await screen.findByText('Delete Neon Nights?')).toBeInTheDocument();
    expect(
      screen.getByText("This removes the draft and its pricing. This can't be undone."),
    ).toBeInTheDocument();
  });

  it('warns about automatic refunds before cancelling a published show', async () => {
    mockGateway();
    renderWithQuery(<ShowsScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel show' }));

    expect(await screen.findByText('Cancel Demo Concert?')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Every paid order for this show will be refunded automatically. This can't be undone.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Refunds are processed by Stripe/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel show & refund' })).toBeInTheDocument();
  });

  it('refetches the list after a delete, rather than waiting for a reload', async () => {
    const fetchMock = mockGateway();
    renderWithQuery(<ShowsScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete draft' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete draft' }));

    const listCalls = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/organizer/shows') &&
          (init as RequestInit | undefined)?.method === undefined,
      ).length;

    // The empty 200 the route returns used to reject the mutation, so `onSuccess` never ran and
    // this second GET never happened.
    await waitFor(() => expect(listCalls()).toBeGreaterThan(1));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('DELETEs the show once the cancel is confirmed', async () => {
    const fetchMock = mockGateway();
    renderWithQuery(<ShowsScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel show' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel show & refund' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/organizer/shows/11111111-1111-4111-8111-111111111111'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });
});
