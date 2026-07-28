import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { mockGateway } from '../test-gateway';
import { Dashboard } from './dashboard';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Dashboard', () => {
  it('shows sales, capacity and revenue for the selected show', async () => {
    mockGateway();
    renderWithQuery(<Dashboard />);

    const soldCard = (await screen.findByText('TICKETS SOLD')).closest('div')!;

    expect(within(soldCard).getByText('120')).toBeInTheDocument();
    expect(within(soldCard).getByText('of 400 seats')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('$24,000')).toBeInTheDocument();
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

  it('asks a new organizer to create a show first', async () => {
    mockGateway({ '/shows': { status: 200, body: { items: [], nextCursor: null } } });
    renderWithQuery(<Dashboard />);

    expect(
      await screen.findByText('You have no shows yet. Create one to start selling tickets.'),
    ).toBeInTheDocument();
  });
});
