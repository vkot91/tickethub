import { type Metadata } from 'next';

import { Card, Eyebrow } from '@tickethub/ui';

import { BecomeForm } from '@/features/organizer/become-form';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Become an organizer' };

export default async function BecomePage() {
  const user = await getCurrentUser();

  return (
    <Card radius="panel" padding="lg" className="mx-auto max-w-130">
      <Eyebrow>Organizer</Eyebrow>

      <h1 className="mt-2 mb-3 font-display text-[28px] font-semibold tracking-[-0.02em]">
        Start selling tickets
      </h1>

      <p className="mb-6 max-w-[56ch] text-sm text-fg-muted">
        Put your own shows on sale, price each section of the hall, watch the money come in, and
        check guests in at the gate with the scanner.
      </p>

      <BecomeForm email={user?.email ?? ''} />
    </Card>
  );
}
