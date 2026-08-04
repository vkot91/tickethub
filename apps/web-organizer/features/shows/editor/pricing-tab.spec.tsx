import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PutPricingDto } from '@tickethub/contracts';

import { renderWithQuery } from '../../../test/render';
import {
  draftShow,
  mockGateway,
  publishedShow,
  savedPricing,
  SECTION_A_ID,
} from '../../test-gateway';
import { PricingTab } from './pricing-tab';

afterEach(() => vi.unstubAllGlobals());

/** The body of the last PUT, which is the only thing this screen actually asks the server for. */
function putBody(fetchMock: ReturnType<typeof mockGateway>): PutPricingDto {
  const call = fetchMock.mock.calls.findLast(([, init]) => init?.method === 'PUT');

  return JSON.parse(String(call?.[1]?.body));
}

const priced = {
  [`/organizer/shows/${draftShow.id}/pricing`]: { status: 200, body: savedPricing },
};

async function addBand(name: string, dollars: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Add band' }));
  await userEvent.type(screen.getByLabelText('Band name'), name);

  const price = screen.getByLabelText(`Price in dollars for ${name}`);
  await userEvent.clear(price);
  await userEvent.type(price, dollars);
  // Parsing happens on blur, not per keystroke — a half-typed `19.` is not a price.
  await userEvent.tab();
}

/** Radix Select is a listbox, not a native <select>. */
async function assignSection(sectionName: string, bandLabel: string | RegExp) {
  await userEvent.click(screen.getByRole('combobox', { name: `Price band for ${sectionName}` }));
  await userEvent.click(await screen.findByRole('option', { name: bandLabel }));
}

describe('PricingTab', () => {
  it('seeds the form from the show’s saved pricing', async () => {
    mockGateway(priced);

    renderWithQuery(<PricingTab show={draftShow} />);

    expect(await screen.findByDisplayValue('Front VIP')).toBeInTheDocument();
    // 9000 cents reads as dollars in the input, not as cents.
    expect(screen.getByLabelText('Price in dollars for Front VIP')).toHaveValue('90.00');
    expect(screen.getByText('1 OF 2 SECTIONS ON SALE · 4 SEATS')).toBeInTheDocument();
  });

  it('sends $19.99 as 1999 cents', async () => {
    const fetchMock = mockGateway();

    renderWithQuery(<PricingTab show={draftShow} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add band' })).toBeEnabled());
    await addBand('Stalls', '19.99');
    await userEvent.click(screen.getByRole('button', { name: 'Save pricing' }));

    await waitFor(() => expect(putBody(fetchMock).ticketTypes[0].priceCents).toBe(1999));
  });

  // The reason `putPricingSchema` addresses bands by `key` rather than id.
  it('assigns a brand-new band to a section before any save', async () => {
    const fetchMock = mockGateway();

    renderWithQuery(<PricingTab show={draftShow} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add band' })).toBeEnabled());
    await addBand('Stalls', '25');
    await assignSection('Parterre', 'Stalls');
    await userEvent.click(screen.getByRole('button', { name: 'Save pricing' }));

    await waitFor(() => {
      const body = putBody(fetchMock);
      const key = body.ticketTypes[0].key;

      expect(body.assignments).toEqual([{ sectionId: SECTION_A_ID, ticketTypeKey: key }]);
    });
  });

  it('unassigns the sections that used a band when it is removed', async () => {
    const fetchMock = mockGateway(priced);

    renderWithQuery(<PricingTab show={draftShow} />);

    await screen.findByDisplayValue('Front VIP');
    // Parterre is on this band, so removing it has to take Parterre off sale too.
    expect(screen.getByText('1 OF 2 SECTIONS ON SALE · 4 SEATS')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Front VIP' }));

    expect(screen.getByText('0 OF 2 SECTIONS ON SALE · 0 SEATS')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save pricing' }));

    await waitFor(() => {
      const body = putBody(fetchMock);

      expect(body.ticketTypes).toEqual([]);
      // No dangling ticketTypeKey — that body would be a 400 with nothing on screen to explain it.
      expect(body.assignments).toEqual([]);
    });
  });

  it('warns how many sections a band is about to take off sale', async () => {
    mockGateway(priced);

    renderWithQuery(<PricingTab show={draftShow} />);

    await screen.findByDisplayValue('Front VIP');

    expect(screen.getByText(/1 section uses this band/)).toBeInTheDocument();
  });

  it('counts only assigned sections in the summary', async () => {
    mockGateway();

    renderWithQuery(<PricingTab show={draftShow} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add band' })).toBeEnabled());
    expect(screen.getByText('0 OF 2 SECTIONS ON SALE · 0 SEATS')).toBeInTheDocument();

    await addBand('Flat', '10');
    await assignSection('Parterre', 'Flat');
    expect(screen.getByText('1 OF 2 SECTIONS ON SALE · 4 SEATS')).toBeInTheDocument();

    await assignSection('Balcony', 'Flat');
    expect(screen.getByText('2 OF 2 SECTIONS ON SALE · 6 SEATS')).toBeInTheDocument();
  });

  it('takes a section off sale again', async () => {
    const fetchMock = mockGateway(priced);

    renderWithQuery(<PricingTab show={draftShow} />);

    await screen.findByDisplayValue('Front VIP');
    await assignSection('Parterre', '— Not on sale —');

    expect(screen.getByText('0 OF 2 SECTIONS ON SALE · 0 SEATS')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save pricing' }));

    await waitFor(() => expect(putBody(fetchMock).assignments).toEqual([]));
  });

  it('keeps the previous price when the input is not a price', async () => {
    const fetchMock = mockGateway(priced);

    renderWithQuery(<PricingTab show={draftShow} />);

    const price = await screen.findByLabelText('Price in dollars for Front VIP');
    await userEvent.clear(price);
    await userEvent.type(price, '-40');
    await userEvent.tab();

    expect(price).toHaveValue('90.00');

    await userEvent.click(screen.getByRole('button', { name: 'Save pricing' }));

    await waitFor(() => expect(putBody(fetchMock).ticketTypes[0].priceCents).toBe(9000));
  });

  it('renders read-only for a published show — plain text, not disabled inputs', async () => {
    mockGateway({
      [`/organizer/shows/${publishedShow.id}/pricing`]: { status: 200, body: savedPricing },
    });

    renderWithQuery(<PricingTab show={publishedShow} />);

    // Twice over: the band's own row, and the section it prices.
    expect(await screen.findAllByText('Front VIP')).toHaveLength(2);

    // A page of disabled controls reads as broken; there are simply no controls.
    expect(screen.queryByLabelText('Band name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add band' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save pricing' })).not.toBeInTheDocument();
    // The price too: once in the band row, once as the section's resolved price.
    expect(screen.getAllByText('$90')).toHaveLength(2);
  });

  it('shows the empty state when nothing is priced', async () => {
    mockGateway();

    renderWithQuery(<PricingTab show={draftShow} />);

    expect(
      await screen.findByText('No bands yet. Add one to start pricing sections.'),
    ).toBeInTheDocument();
  });

  // A show that left draft while this tab was open. The write fails; the screen must say so
  // rather than sit there looking saved.
  it('reports a rejected save rather than looking like it worked', async () => {
    const fetchMock = mockGateway();
    const reads = fetchMock.getMockImplementation();

    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? Promise.resolve({
            ok: false,
            status: 409,
            statusText: 'Conflict',
            text: () =>
              Promise.resolve(
                JSON.stringify({ message: 'Cannot change pricing on a published show' }),
              ),
          } as unknown as Response)
        : reads!(url, init),
    );

    renderWithQuery(<PricingTab show={draftShow} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add band' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Save pricing' }));

    expect(await screen.findByText('Could not save pricing')).toBeInTheDocument();
  });
});
