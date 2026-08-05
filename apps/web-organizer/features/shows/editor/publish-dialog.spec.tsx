import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublishChecklist } from '@tickethub/contracts';

import { renderWithQuery } from '../../../test/render';
import { draftShow, mockGateway, readyChecklist } from '../../test-gateway';
import { PublishDialog } from './publish-dialog';

afterEach(() => vi.unstubAllGlobals());

const checklistPath = `/organizer/shows/${draftShow.id}/publish-checklist`;

function withChecklist(checklist: PublishChecklist) {
  return mockGateway({ [checklistPath]: { status: 200, body: checklist } });
}

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

  return screen.findByRole('button', { name: 'Publish show' });
}

describe('PublishDialog', () => {
  it('fetches the checklist on open, not on mount — it is stale by then', async () => {
    const fetchMock = withChecklist(readyChecklist);

    renderWithQuery(<PublishDialog show={draftShow} />);

    const calledChecklist = () =>
      fetchMock.mock.calls.some(([url]) => String(url).includes('publish-checklist'));

    expect(calledChecklist()).toBe(false);

    await openDialog();

    await waitFor(() => expect(calledChecklist()).toBe(true));
  });

  it('enables Publish show when every line passes', async () => {
    withChecklist(readyChecklist);

    renderWithQuery(<PublishDialog show={draftShow} />);

    await waitFor(async () => expect(await openDialog()).toBeEnabled());
    expect(screen.getByText('1 of 2 sections, 4 seats')).toBeInTheDocument();
  });

  it.each([
    ['hasPriceBands', 'No bands yet'],
    ['hasPricedSections', '0 of 2 sections, 0 seats'],
    ['startsInFuture', /which has passed/],
  ] as const)('disables Publish show while %s is false', async (flag, detail) => {
    withChecklist({
      ...readyChecklist,
      [flag]: false,
      ...(flag === 'hasPricedSections' ? { pricedSectionCount: 0, seatsOnSale: 0 } : {}),
    });

    renderWithQuery(<PublishDialog show={draftShow} />);

    await waitFor(async () => expect(await openDialog()).toBeDisabled());
    expect(screen.getByText(detail)).toBeInTheDocument();
    expect(screen.getByText('1 thing still to fix.')).toBeInTheDocument();
  });

  it('counts every failing line', async () => {
    withChecklist({ ...readyChecklist, hasPriceBands: false, hasPricedSections: false });

    renderWithQuery(<PublishDialog show={draftShow} />);

    await openDialog();

    expect(await screen.findByText('2 things still to fix.')).toBeInTheDocument();
  });

  // The checklist is a convenience, never the gate: `publishShow` re-evaluates it server-side.
  // The organizer is looking at the list of rules, so the rule that failed belongs here.
  it('renders a 409 inside the dialog and refetches the checklist', async () => {
    const fetchMock = withChecklist(readyChecklist);
    const reads = fetchMock.getMockImplementation();

    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'POST' && String(url).endsWith('/publish')
        ? Promise.resolve({
            ok: false,
            status: 409,
            statusText: 'Conflict',
            text: () =>
              Promise.resolve(
                JSON.stringify({ message: 'Assign at least one section to a price band' }),
              ),
          } as unknown as Response)
        : reads!(url, init),
    );

    renderWithQuery(<PublishDialog show={draftShow} />);

    await userEvent.click(await openDialog());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Assign at least one section to a price band');

    // Not a toast behind a dialog that is still open.
    expect(screen.getByRole('button', { name: 'Publish show' })).toBeInTheDocument();

    const checklistReads = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes('publish-checklist')).length;

    await waitFor(() => expect(checklistReads()).toBeGreaterThan(1));
  });

  it('closes and toasts a link to the public page on success', async () => {
    withChecklist(readyChecklist);

    renderWithQuery(<PublishDialog show={draftShow} />);

    await userEvent.click(await openDialog());

    expect(await screen.findByText('Neon Nights is on sale')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View public page →' })).toHaveAttribute(
      'href',
      `http://app.localhost:4000/shows/${draftShow.id}`,
    );
    // No second dialog to dismiss.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Publish show' })).not.toBeInTheDocument(),
    );
  });

  it('does not carry a stale conflict into the next attempt', async () => {
    const fetchMock = withChecklist(readyChecklist);
    const reads = fetchMock.getMockImplementation();
    let failNext = true;

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/publish') && failNext) {
        failNext = false;

        return Promise.resolve({
          ok: false,
          status: 409,
          statusText: 'Conflict',
          text: () =>
            Promise.resolve(JSON.stringify({ message: 'A show that has already started' })),
        } as unknown as Response);
      }

      return reads!(url, init);
    });

    renderWithQuery(<PublishDialog show={draftShow} />);

    await userEvent.click(await openDialog());
    await screen.findByRole('alert');

    await userEvent.keyboard('{Escape}');
    await openDialog();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
