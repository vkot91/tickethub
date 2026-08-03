import { type Metadata } from 'next';
import { Instrument_Sans, JetBrains_Mono, Space_Grotesk } from 'next/font/google';

import { Toaster } from '@tickethub/ui';
import { QueryProvider } from '@tickethub/web-kit/query-provider';

import { ConsoleHeader } from '@/components/console-header';

import './globals.css';

const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
});

const body = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-instrument-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: { default: 'TicketHub Console', template: '%s · TicketHub Console' },
  description: 'Manage your shows, watch sales and check guests in.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <QueryProvider>
          <ConsoleHeader />
          <main className="mx-auto max-w-295 px-6 py-10">{children}</main>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
