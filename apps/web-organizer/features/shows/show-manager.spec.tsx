import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { mockGateway } from '../test-gateway';
import { ShowManager } from './show-manager';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ShowManager', () => {
  it('lists shows with their status', async () => {
    mockGateway();
    renderWithQuery(<ShowManager />);

    expect(await screen.findByRole('heading', { name: 'Demo Concert' })).toBeInTheDocument();
    expect(screen.getByText('On sale')).toBeInTheDocument();
  });

  it('opens a create form on demand', async () => {
    mockGateway();
    renderWithQuery(<ShowManager />);

    await userEvent.click(await screen.findByRole('button', { name: 'New show' }));

    expect(screen.getByRole('heading', { name: 'Create a show' })).toBeInTheDocument();
  });

  it('prefills the edit form from the show', async () => {
    mockGateway();
    renderWithQuery(<ShowManager />);

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('heading', { name: 'Edit show' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Demo Concert');
  });

  it('warns that cancelling refunds everyone, and only then calls the API', async () => {
    const fetchMock = mockGateway();
    renderWithQuery(<ShowManager />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel show' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Every paid order is refunded automatically',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('cancels the show once confirmed', async () => {
    const fetchMock = mockGateway();
    renderWithQuery(<ShowManager />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel show' }));

    const dialog = await screen.findByRole('alertdialog');

    await userEvent.click(await within(dialog).findByRole('button', { name: 'Cancel show' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true),
    );
  });
});
