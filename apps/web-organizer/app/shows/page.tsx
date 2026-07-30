import { type Metadata } from 'next';

import { WelcomeToast } from '@/features/organizer/welcome-toast';
import { ShowManager } from '@/features/shows/show-manager';

export const metadata: Metadata = { title: 'Shows' };

export default async function ShowsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;

  return (
    <>
      {welcome === '1' && <WelcomeToast />}
      <ShowManager />
    </>
  );
}
