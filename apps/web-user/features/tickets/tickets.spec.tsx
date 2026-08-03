import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { fetchTickets, ticketKeys, type Ticket } from './api';
import { TicketList } from './ticket-list';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    orderId: '55555555-5555-4555-8555-555555555555',
    showTitle: 'Demo Concert',
    showStartsAt: '2026-08-14T20:00:00.000Z',
    venueName: 'Palace of Sports',
    seatLabel: 'A1',
    tier: 'VIP',
    code: 'TH-E1-A1-1042',
    qrToken: 'signed.hmac.token',
    pdfUrl: '/tickets/t-1/pdf',
    status: 'active',
    ...overrides,
  };
}

function mockTickets(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    statusText: 'Error',
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function renderTickets() {
  return renderWithQuery(<TicketList />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('tickets api', () => {
  it('namespaces the list key', () => {
    expect(ticketKeys.list()).toEqual(['tickets', 'list']);
  });

  it('goes through the BFF proxy', async () => {
    const fetchMock = mockTickets({ items: [] });

    await fetchTickets();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/gateway/tickets');
  });

  it('rejects a ticket the schema does not recognise', async () => {
    mockTickets({ items: [{ id: 'not-a-uuid' }] });

    await expect(fetchTickets()).rejects.toThrow();
  });
});

describe('TicketList', () => {
  it('renders the seat, tier, code and a scannable QR', async () => {
    mockTickets({ items: [makeTicket()] });
    renderTickets();

    expect(await screen.findByText('A1')).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('TH-E1-A1-1042')).toBeInTheDocument();
    expect(screen.getByLabelText('Ticket QR code for seat A1')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('offers the PDF as a download when one exists', async () => {
    mockTickets({ items: [makeTicket()] });
    renderTickets();

    const download = await screen.findByRole('link', { name: /Download PDF/ });

    // The API returns a gateway-relative path, never a signed URL — the card prefixes the proxy
    // base. The 60-second signed URL is minted behind this endpoint, per click.
    expect(download).toHaveAttribute('href', '/api/gateway/tickets/t-1/pdf');
    expect(download).toHaveAttribute('download');
  });

  it('explains itself when the PDF has not been generated yet', async () => {
    mockTickets({ items: [makeTicket({ pdfUrl: null })] });
    renderTickets();

    expect(await screen.findByText('PDF is still being generated.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Download PDF/ })).not.toBeInTheDocument();
  });

  it.each([
    ['checked_in', 'CHECKED IN'],
    ['void', 'VOID'],
  ] as const)('labels a %s ticket', async (status, label) => {
    mockTickets({ items: [makeTicket({ status })] });
    renderTickets();

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('sends a user with no tickets to their orders', async () => {
    mockTickets({ items: [] });
    renderTickets();

    expect(await screen.findByRole('link', { name: 'My orders' })).toHaveAttribute(
      'href',
      '/orders',
    );
  });
});
