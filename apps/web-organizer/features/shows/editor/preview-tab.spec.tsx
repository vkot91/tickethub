import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '../../../test/render';
import { draftShow, mockGateway, savedPricing } from '../../test-gateway';
import { PreviewTab } from './preview-tab';

afterEach(() => vi.unstubAllGlobals());

const priced = {
  [`/organizer/shows/${draftShow.id}/pricing`]: { status: 200, body: savedPricing },
};

describe('PreviewTab', () => {
  it('draws only the sections that are on sale, at the price the band says', async () => {
    mockGateway(priced);

    // Parterre is on the Front VIP band at $90; Balcony is not priced at all.
    expect(await renderAndFind('Parterre')).toBeInTheDocument();
    expect(screen.queryByText('Balcony')).not.toBeInTheDocument();
    // Once as the row's price label, once in the price-tier row beneath the map.
    expect(screen.getAllByText('$90').length).toBeGreaterThan(0);
    expect(screen.getByText('Front VIP')).toBeInTheDocument();
  });

  it('renders every seat of a priced section', async () => {
    mockGateway(priced);

    await renderAndFind('Parterre');

    // Parterre is four seats in one row, all of them available in a preview.
    expect(screen.getByText('STAGE')).toBeInTheDocument();
    for (const seat of ['1', '2', '3', '4']) {
      expect(screen.getByText(seat)).toBeInTheDocument();
    }
  });

  it('shows the empty state when nothing is priced', async () => {
    mockGateway();

    renderWithQuery(<PreviewTab show={draftShow} />);

    expect(
      await screen.findByText(
        'Nothing is on sale yet. Price at least one section on the Pricing tab.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('STAGE')).not.toBeInTheDocument();
  });

  it('captions what the organizer is looking at', async () => {
    mockGateway();

    renderWithQuery(<PreviewTab show={draftShow} />);

    expect(
      await screen.findByText(
        'This is what buyers see. Seat availability is live once the show is published.',
      ),
    ).toBeInTheDocument();
  });
});

async function renderAndFind(text: string) {
  renderWithQuery(<PreviewTab show={draftShow} />);

  return screen.findByText(text);
}
