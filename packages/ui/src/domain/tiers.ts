import type { SeatTier } from '@tickethub/contracts';

/**
 * How the three price bands are worded and coloured. The band itself is always the backend's:
 * it comes off the ticket type covering the seat's section, alongside the `priceCents` orders
 * charges. Nothing here derives a tier — or a price — from row numbers or any other geometry.
 */
export const TIER_LABELS: Record<SeatTier, string> = {
  vip: 'VIP',
  standard: 'Standard',
  economy: 'Economy',
};

export const TIER_DOT: Record<SeatTier, string> = {
  vip: 'bg-tier-vip',
  standard: 'bg-tier-standard',
  economy: 'bg-tier-economy',
};

/** A seat no ticket type covers is not on sale; it renders neutral rather than borrowing a
 *  band it was never priced in. */
export const DEFAULT_TIER: SeatTier = 'standard';
