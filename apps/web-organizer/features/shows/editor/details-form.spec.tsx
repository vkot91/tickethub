import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '../../../test/render';
import { draftShow, mockGateway, OTHER_VENUE_ID, publishedShow } from '../../test-gateway';
import { DetailsForm } from './details-form';

afterEach(() => vi.unstubAllGlobals());

/** The last PATCH the form sent, parsed back out of the fetch mock. */
function patchBody(fetchMock: ReturnType<typeof mockGateway>): unknown {
  const call = fetchMock.mock.calls.findLast(([, init]) => init?.method === 'PATCH');

  return JSON.parse(String(call?.[1]?.body));
}

describe('DetailsForm', () => {
  it('sends only the fields that changed — a published show 409s on any other key', async () => {
    const fetchMock = mockGateway();

    renderWithQuery(<DetailsForm show={publishedShow} />);

    await userEvent.type(screen.getByLabelText('Title'), ' Live');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchBody(fetchMock)).toEqual({ title: 'Demo Concert Live' }));
  });

  it('locks the venue and the start time on a published show', async () => {
    mockGateway();

    renderWithQuery(<DetailsForm show={publishedShow} />);

    await waitFor(() => expect(screen.getByLabelText('Venue')).toBeDisabled());
    expect(screen.getByLabelText('Starts at')).toBeDisabled();
  });

  it('leaves both editable on a draft', async () => {
    mockGateway();

    renderWithQuery(<DetailsForm show={draftShow} />);

    await waitFor(() => expect(screen.getByLabelText('Venue')).toBeEnabled());
    expect(screen.getByLabelText('Starts at')).toBeEnabled();
  });

  it('is read-only for a cancelled show — no Save, nothing to type into', async () => {
    mockGateway();

    renderWithQuery(<DetailsForm show={{ ...publishedShow, status: 'cancelled' }} />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toBeDisabled());
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('keeps Save inert until something is actually edited', () => {
    mockGateway();

    renderWithQuery(<DetailsForm show={draftShow} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('warns that a venue change unassigns every section, and saves nothing until it is confirmed', async () => {
    const fetchMock = mockGateway();

    renderWithQuery(<DetailsForm show={draftShow} />);

    await waitFor(() => expect(screen.getByLabelText('Venue')).toBeEnabled());

    await userEvent.click(screen.getByLabelText('Venue'));
    await userEvent.click(await screen.findByRole('option', { name: /Side Room/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      /Every section goes back to Not on sale.*price bands and their prices are kept/,
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Change venue' }));

    await waitFor(() => expect(patchBody(fetchMock)).toEqual({ venueId: OTHER_VENUE_ID }));
  });

  it('refuses a sale that starts after the show does, and sends nothing', async () => {
    const fetchMock = mockGateway();

    // The show opens 2026-08-14 20:00 UTC; sales are set a day later.
    renderWithQuery(<DetailsForm show={publishedShow} />);

    await userEvent.type(screen.getByLabelText('Sale starts at'), '2026-08-15T10:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Sales cannot start after the show does.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('allows a sale that opens exactly at curtain', async () => {
    const fetchMock = mockGateway();

    renderWithQuery(<DetailsForm show={publishedShow} />);

    // Read off the DOM property: RHF leaves these inputs uncontrolled, so there is no `value`
    // attribute to read.
    const saleStart = screen.getByLabelText<HTMLInputElement>('Starts at').value;

    await userEvent.type(screen.getByLabelText('Sale starts at'), saleStart);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchBody(fetchMock)).toEqual({ saleStartsAt: publishedShow.startsAt }),
    );
  });

  it('clears a sale start rather than leaving it alone — null, not an absent key', async () => {
    const fetchMock = mockGateway();

    const show = { ...publishedShow, saleStartsAt: '2026-08-01T10:00:00.000Z' };

    renderWithQuery(<DetailsForm show={show} />);

    await userEvent.clear(screen.getByLabelText('Sale starts at'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchBody(fetchMock)).toEqual({ saleStartsAt: null }));
  });
});
