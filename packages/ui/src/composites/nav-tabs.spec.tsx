import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavTabs } from './nav-tabs';

const pathname = vi.fn();

vi.mock('next/navigation', () => ({ usePathname: () => pathname() }));

const TABS = [
  { href: '/', label: 'Catalog' },
  { href: '/orders', label: 'My orders' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/shows', label: 'Shows' },
];

function activeTab(): string | null {
  return screen.queryByRole('link', { current: 'page' })?.textContent ?? null;
}

afterEach(() => vi.clearAllMocks());

describe('NavTabs', () => {
  it.each([
    ['/', 'Catalog'],
    ['/orders', 'My orders'],
    ['/orders/abc/checkout', 'My orders'],
    ['/dashboard', 'Dashboard'],
    ['/dashboard/shows', 'Shows'],
  ])('marks %s as %s', (path, expected) => {
    pathname.mockReturnValue(path);

    render(<NavTabs tabs={TABS} />);

    expect(activeTab()).toBe(expected);
  });

  it('marks exactly one tab active, never a parent as well', () => {
    pathname.mockReturnValue('/dashboard/shows');

    render(<NavTabs tabs={TABS} />);

    expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1);
  });

  it('leaves every tab inactive on an unrelated route', () => {
    pathname.mockReturnValue('/login');

    render(<NavTabs tabs={TABS} />);

    expect(activeTab()).toBeNull();
  });

  it('does not match a route that merely shares a prefix', () => {
    pathname.mockReturnValue('/orders-archive');

    render(<NavTabs tabs={TABS} />);

    expect(activeTab()).toBeNull();
  });
});
