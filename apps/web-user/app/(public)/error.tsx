'use client';

import { Button, Card } from '@tickethub/ui';

export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-295 px-6 py-16">
      <Card radius="panel" padding="lg" className="mx-auto max-w-120 text-center">
        <h1 className="mb-2 font-display text-2xl font-semibold">Something went wrong</h1>
        <p className="mb-6 text-sm text-fg-muted">
          We could not load this page. The shows service may be briefly unavailable.
        </p>
        <Button onClick={reset}>Try again</Button>
      </Card>
    </div>
  );
}
