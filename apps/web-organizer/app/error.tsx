'use client';

import { Button, Card } from '@tickethub/ui';

export default function OrganizerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card radius="panel" padding="lg" className="mx-auto max-w-120 text-center">
      <h1 className="mb-2 font-display text-2xl font-semibold">Something went wrong</h1>
      <p className="mb-6 text-sm text-fg-muted">
        We could not load your organizer data. No sales were affected.
      </p>
      <Button onClick={reset}>Try again</Button>
    </Card>
  );
}
