import Link from 'next/link';

import { Button, LogoutButton, type NavTab, NavTabs } from '@tickethub/ui';
import { getCurrentUser } from '@/lib/session';

const PUBLIC_TABS: NavTab[] = [{ href: '/', label: 'Catalog' }];

const USER_TABS: NavTab[] = [
  { href: '/orders', label: 'My orders' },
  { href: '/tickets', label: 'My tickets' },
];

// No organizer tabs: the console is `apps/organizer`, a separate origin with its own session.
// An organizer signs in there separately rather than following a link out of this header.

export async function SiteHeader() {
  const user = await getCurrentUser();

  const tabs = [...PUBLIC_TABS, ...(user ? USER_TABS : [])];

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-page/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-295 flex-wrap items-center gap-5 px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="relative size-6.5 rounded-lg bg-accent shadow-[0_0_20px_color-mix(in_oklab,var(--color-accent)_55%,transparent)] before:absolute before:top-1/2 before:-left-0.5 before:size-1.5 before:-translate-y-1/2 before:rounded-pill before:bg-page before:content-[''] after:absolute after:top-1/2 after:-right-0.5 after:size-1.5 after:-translate-y-1/2 after:rounded-pill after:bg-page after:content-['']"
          />
          <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-fg">
            Ticket<span className="text-accent">Hub</span>
          </span>
        </Link>

        <NavTabs tabs={tabs} />

        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-fg-faint sm:inline">{user.email}</span>
            <LogoutButton />
          </div>
        ) : (
          <Button asChild variant="secondary" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
