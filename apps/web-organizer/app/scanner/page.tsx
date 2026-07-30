import { type Metadata } from 'next';

import { Card } from '@tickethub/ui';

import { Scanner } from '@/features/scanner/scanner';

export const metadata: Metadata = { title: 'Scanner' };

export default async function ScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ showId?: string }>;
}) {
  const { showId } = await searchParams;

  // A scanner without a gate cannot scan: admitting against "any show you own" is what lets
  // tonight's attendant burn next week's ticket. ponytail: the show picker is screen K's job —
  // until then the gate comes in on the query string.
  if (!showId) {
    return (
      <Card padding="lg" radius="panel">
        <p className="text-sm text-fg-secondary">
          Pick a show to scan for — open this page as <code>/scanner?showId=…</code>.
        </p>
      </Card>
    );
  }

  return <Scanner showId={showId} />;
}
