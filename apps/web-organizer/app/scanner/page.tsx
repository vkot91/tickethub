import { type Metadata } from 'next';

import { Scanner } from '@/features/scanner/scanner';

export const metadata: Metadata = { title: 'Scanner' };

export default function ScannerPage() {
  return <Scanner />;
}
