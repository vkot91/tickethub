import { type Metadata } from 'next';
import { Instrument_Sans, JetBrains_Mono, Space_Grotesk } from 'next/font/google';

import { QueryProvider } from '@tickethub/web-kit/query-provider';

import { SiteHeader } from '@/components/site-header';

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
  title: { default: 'TicketHub', template: '%s · TicketHub' },
  description: 'Concerts, club nights and theatre. Real-time seat selection, instant tickets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <QueryProvider>
          <SiteHeader />
          <main>{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
