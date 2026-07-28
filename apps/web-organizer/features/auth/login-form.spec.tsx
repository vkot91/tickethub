import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from './login-form';
import { signInAction } from './actions';

/** The action itself runs on the server; this suite covers what the form hands it and what it
 *  does with the message it gets back. `actions.spec.ts` covers the action. */
vi.mock('./actions', () => ({ signInAction: vi.fn().mockResolvedValue(null) }));

async function submit(email: string, password: string) {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('LoginForm', () => {
  it('submits the credentials with the destination bound on the server', async () => {
    render(<LoginForm next="/shows" />);

    await submit('promoter@example.com', 'hunter2hunter2');

    const [next, , formData] = vi.mocked(signInAction).mock.calls[0];

    expect(next).toBe('/shows');
    expect({ email: formData.get('email'), password: formData.get('password') }).toEqual({
      email: 'promoter@example.com',
      password: 'hunter2hunter2',
    });
  });

  it('shows the message the action returns when the credentials are rejected', async () => {
    vi.mocked(signInAction).mockResolvedValueOnce('Invalid credentials');
    render(<LoginForm next="/" />);

    await submit('promoter@example.com', 'wrongpassword');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });
});
