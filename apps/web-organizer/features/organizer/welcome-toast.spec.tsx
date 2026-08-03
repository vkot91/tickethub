import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Toaster } from '@tickethub/ui';

import { WelcomeToast } from './welcome-toast';

describe('WelcomeToast', () => {
  it('announces on the app Toaster that the account is now an organizer', async () => {
    render(
      <>
        <Toaster />
        <WelcomeToast />
      </>,
    );

    expect(await screen.findByText("You're an organizer")).toBeInTheDocument();
    expect(screen.getByText('Start by creating a show.')).toBeInTheDocument();
  });
});
