import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavTabs } from './nav-tabs';

const pathname = vi.fn();
const search = vi.fn(() => '');

vi.mock('next/navigation', () => ({
  usePathname: () => pathname(),
  useSearchParams: () => new URLSearchParams(search()),
}));

const TABS = [
  { href: '/', label: 'Catalog' },
  { href: '/orders', label: 'My orders' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/shows', label: 'Shows' },
];

function activeTab(): string | null {
  return screen.queryByRole('link', { current: 'page' })?.textContent ?? null;
}

afterEach(() => {
  vi.clearAllMocks();
  search.mockReturnValue('');
});

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

// The show editor's three tabs are one route and one data fetch, told apart by `?tab=`.
describe('NavTabs on a search param', () => {
  const EDITOR_TABS = [
    { href: '/shows/1/edit', label: 'Details' },
    { href: '/shows/1/edit?tab=pricing', label: 'Pricing' },
    { href: '/shows/1/edit?tab=preview', label: 'Preview' },
  ];

  it.each([
    ['', 'Details'],
    ['?tab=pricing', 'Pricing'],
    ['?tab=preview', 'Preview'],
  ])('marks %s as %s', (query, expected) => {
    pathname.mockReturnValue('/shows/1/edit');
    search.mockReturnValue(query);

    render(<NavTabs tabs={EDITOR_TABS} />);

    expect(activeTab()).toBe(expected);
    expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1);
  });

  it('falls back to the bare tab when the param names nothing', () => {
    pathname.mockReturnValue('/shows/1/edit');
    search.mockReturnValue('?tab=nonsense');

    render(<NavTabs tabs={EDITOR_TABS} />);

    expect(activeTab()).toBe('Details');
  });
});
