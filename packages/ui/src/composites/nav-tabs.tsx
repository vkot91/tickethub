'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { cn } from '../lib/cn';

export interface NavTab {
  href: string;
  label: string;
}

/** A tab whose `href` carries a query — the show editor's `?tab=pricing` — is current only when
 *  the URL carries it too. A bare `href` matches on the pathname alone, which makes it the
 *  default tab: its siblings' hrefs are longer, so they win the sort whenever they match. */
function matches(pathname: string, search: URLSearchParams, href: string): boolean {
  const [path, query] = href.split('?');

  if (pathname !== path && !(path !== '/' && pathname.startsWith(`${path}/`))) return false;

  return [...new URLSearchParams(query)].every(([key, value]) => search.get(key) === value);
}

export function NavTabs({ tabs }: { tabs: NavTab[] }) {
  // Both are typed non-null but return `null` outside the App Router — which is where a unit
  // test that renders a screen containing these tabs lives.
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams() ?? new URLSearchParams();

  // Longest match wins, so /dashboard/shows highlights Shows rather than both it and Dashboard.
  const activeHref = tabs
    .filter((tab) => matches(pathname, searchParams, tab.href))
    .sort((a, b) => b.href.length - a.href.length)
    .at(0)?.href;

  return (
    <nav className="flex min-w-0 flex-1 gap-1 overflow-auto">
      {tabs.map((tab) => {
        const isActive = tab.href === activeHref;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-control border px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition',
              isActive
                ? 'border-accent/45 bg-accent/[0.18] text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
