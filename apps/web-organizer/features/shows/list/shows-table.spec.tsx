import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { draftShow, publishedShow } from '../../test-gateway';
import { ShowsTable } from './shows-table';

const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function rowFor(title: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(title) });
}

describe('ShowsTable', () => {
  it('renders — rather than 0 for a draft: it has not failed to sell, it is not on sale', () => {
    render(<ShowsTable shows={[draftShow]} onCancel={vi.fn()} onDelete={vi.fn()} />);

    const cells = within(rowFor('Neon Nights')).getAllByRole('cell');

    expect(cells[4]).toHaveTextContent('—');
    expect(cells[5]).toHaveTextContent('—');
    expect(cells[4]).not.toHaveTextContent('0');
    expect(cells[5]).not.toHaveTextContent('0');
  });

  it('renders the sold count and a progress bar for a published show', () => {
    render(<ShowsTable shows={[publishedShow]} onCancel={vi.fn()} onDelete={vi.fn()} />);

    const row = rowFor('Demo Concert');

    expect(within(row).getByText('184 / 480')).toBeInTheDocument();
    expect(within(row).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '184');
    expect(within(row).getByText('$18,400')).toBeInTheDocument();
  });

  it('offers Cancel show only for a published show', () => {
    render(<ShowsTable shows={[publishedShow, draftShow]} onCancel={vi.fn()} onDelete={vi.fn()} />);

    expect(
      within(rowFor('Demo Concert')).getByRole('button', { name: 'Cancel show' }),
    ).toBeVisible();
    expect(
      within(rowFor('Neon Nights')).queryByRole('button', { name: 'Cancel show' }),
    ).not.toBeInTheDocument();
  });

  it('offers Delete draft only for a draft', () => {
    render(<ShowsTable shows={[publishedShow, draftShow]} onCancel={vi.fn()} onDelete={vi.fn()} />);

    expect(
      within(rowFor('Neon Nights')).getByRole('button', { name: 'Delete draft' }),
    ).toBeVisible();
    expect(
      within(rowFor('Demo Concert')).queryByRole('button', { name: 'Delete draft' }),
    ).not.toBeInTheDocument();
  });

  it('links a published show to its public page and never a draft', () => {
    render(<ShowsTable shows={[publishedShow, draftShow]} onCancel={vi.fn()} onDelete={vi.fn()} />);

    expect(
      within(rowFor('Demo Concert')).getByRole('link', { name: /View public page/ }),
    ).toHaveAttribute('href', expect.stringContaining(publishedShow.id));
    expect(
      within(rowFor('Neon Nights')).queryByRole('link', { name: /View public page/ }),
    ).not.toBeInTheDocument();
  });

  it('opens the editor when the row is clicked', async () => {
    push.mockClear();
    render(<ShowsTable shows={[draftShow]} onCancel={vi.fn()} onDelete={vi.fn()} />);

    await userEvent.click(within(rowFor('Neon Nights')).getByText('Neon Nights'));

    expect(push).toHaveBeenCalledWith(`/shows/${draftShow.id}/edit`);
  });

  it('does not navigate when an action in the row is clicked', async () => {
    push.mockClear();
    const onDelete = vi.fn();

    render(<ShowsTable shows={[draftShow]} onCancel={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(
      within(rowFor('Neon Nights')).getByRole('button', { name: 'Delete draft' }),
    );

    expect(onDelete).toHaveBeenCalledWith(draftShow);
    expect(push).not.toHaveBeenCalled();
  });
});
