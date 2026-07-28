import { type Metadata } from 'next';

import { Card } from '@tickethub/ui';

export const metadata: Metadata = { title: 'Become an organizer' };

// ponytail: static copy, no form — `POST /auth/become-organizer` does not exist yet
// (docs/10-organizer-console.md §Part 2). Swap in the form when that endpoint lands.
export default function BecomePage() {
  return (
    <Card radius="panel" padding="lg" className="mx-auto max-w-130">
      <h1 className="mb-2 font-display text-[28px] font-semibold tracking-[-0.02em]">
        This is the organizer console
      </h1>
      <p className="text-sm text-fg-muted">
        Your account can buy tickets but does not publish shows yet. Organizer signup is not open —
        once your account is upgraded, sign in again here and your shows, sales and check-in scanner
        appear.
      </p>
    </Card>
  );
}
