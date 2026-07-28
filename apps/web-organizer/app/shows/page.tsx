import { type Metadata } from 'next';

import { ShowManager } from '@/features/shows/show-manager';

export const metadata: Metadata = { title: 'Shows' };

export default function ShowsPage() {
  return <ShowManager />;
}
