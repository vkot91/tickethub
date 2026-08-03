import Link from 'next/link';

import { LogoutButton, NavTabs, type NavTab } from '@tickethub/ui';

import { getCurrentUser } from '@/lib/session';

const TABS: NavTab[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/shows', label: 'Shows' },
  { href: '/scanner', label: 'Scanner' },
];

export async function ConsoleHeader() {
  const user = await getCurrentUser();

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
            <span className="ml-2 font-mono text-[11px] tracking-normal text-fg-faint">
              CONSOLE
            </span>
          </span>
        </Link>

        {/* A signed-in `user` is parked on /become and has nothing to navigate to yet. */}
        {user && user.role !== 'user' && <NavTabs tabs={TABS} />}

        {user && (
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-fg-faint sm:inline">{user.email}</span>
            <LogoutButton />
          </div>
        )}
      </div>
    </header>
  );
}
