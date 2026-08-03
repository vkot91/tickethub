import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { toast, Toaster } from './toaster';

afterEach(() => {
  act(() => toast.remove());
});

describe('toast store', () => {
  it('renders a toast queued after the Toaster mounted', async () => {
    render(<Toaster />);

    expect(screen.queryByText('Show created')).not.toBeInTheDocument();

    act(() => void toast.add('success', { title: 'Show created' }));

    expect(await screen.findByText('Show created')).toBeInTheDocument();
  });

  it('stacks multiple toasts, each keyed independently', async () => {
    render(<Toaster />);

    act(() => {
      toast.add('success', { title: 'First' });
      toast.add('success', { title: 'Second' });
    });

    expect(await screen.findByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('renders the optional body a caller passes', async () => {
    render(<Toaster />);

    act(() => void toast.add('warn', { title: 'Those seats just went', body: 'Pick again.' }));

    expect(await screen.findByText('Those seats just went')).toBeInTheDocument();
    expect(screen.getByText('Pick again.')).toBeInTheDocument();
  });

  it('maps each tone onto its design token', async () => {
    render(<Toaster />);

    act(() => {
      toast.add('success', { title: 'Saved' });
      toast.add('warn', { title: 'Careful' });
      toast.add('danger', { title: 'Broke' });
      toast.add('neutral', { title: 'Plain' });
    });

    const toneOf = (title: string) => screen.getByText(title).closest('li')?.className;

    await screen.findByText('Saved');

    expect(toneOf('Saved')).toContain('border-success/40');
    expect(toneOf('Careful')).toContain('border-warn/40');
    expect(toneOf('Broke')).toContain('border-danger/40');
    expect(toneOf('Plain')).toContain('border-line');
  });

  it('passes the full option set through', async () => {
    render(<Toaster />);

    act(() => void toast.add('neutral', { title: 'Slow one', body: 'Lingers.', duration: 60_000 }));

    expect(await screen.findByText('Slow one')).toBeInTheDocument();
    expect(screen.getByText('Lingers.')).toBeInTheDocument();
  });

  it('drops only the dismissed toast', async () => {
    render(<Toaster />);

    let id = '';
    act(() => {
      id = toast.add('danger', { title: 'Doomed' });
      toast.add('danger', { title: 'Survivor' });
    });

    expect(await screen.findByText('Doomed')).toBeInTheDocument();

    act(() => toast.remove(id));

    expect(screen.queryByText('Doomed')).not.toBeInTheDocument();
    expect(screen.getByText('Survivor')).toBeInTheDocument();
  });

  it('drops every toast when removed with no id', async () => {
    render(<Toaster />);

    act(() => {
      toast.add('success', { title: 'First' });
      toast.add('success', { title: 'Second' });
    });

    expect(await screen.findByText('First')).toBeInTheDocument();

    act(() => toast.remove());

    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
  });

  it('drops a toast the user dismisses from its close button', async () => {
    const user = userEvent.setup();

    render(<Toaster />);

    act(() => void toast.add('success', { title: 'Dismiss me' }));

    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  it('stops notifying a Toaster that unmounted', async () => {
    const { unmount } = render(<Toaster />);

    unmount();

    expect(() => act(() => void toast.add('success', { title: 'Nobody listening' }))).not.toThrow();
  });
});
