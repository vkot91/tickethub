'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '../lib/cn';

export interface NavTab {
  href: string;
  label: string;
}

function matches(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}

export function NavTabs({ tabs }: { tabs: NavTab[] }) {
  const pathname = usePathname();

  // Longest match wins, so /dashboard/shows highlights Shows rather than both it and Dashboard.
  const activeHref = tabs
    .filter((tab) => matches(pathname, tab.href))
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
