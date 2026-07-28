import {
  pgSchema,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  primaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core';

export const showsSchema = pgSchema('shows');
export const showStatusEnum = showsSchema.enum('show_status', [
  'draft',
  'published',
  'cancelled',
  'finished',
]);

// Mirrors SEAT_TIERS in @tickethub/contracts — a price band's presentation, never its price.
export const seatTierEnum = showsSchema.enum('seat_tier', ['vip', 'standard', 'economy']);

export const organizers = showsSchema.table('organizers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(), // logical FK to auth.users
  name: text('name').notNull(),
});

export const venues = showsSchema.table('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizerId: uuid('organizer_id')
    .notNull()
    .references(() => organizers.id),
  name: text('name').notNull(),
  address: text('address'),
  city: text('city'),
});

// Seats are physical furniture, so the layout belongs to the venue and every show held there
// reuses it. Which of these sections a given show puts on sale — and at what price — is
// `show_section_pricing`.
export const sections = showsSchema.table(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id),
    name: text('name').notNull(),
  },
  (t) => ({
    // Referenced by show_section_pricing' composite FK, which is how the db proves a show only sells
    // sections of its own venue.
    idVenueUq: unique('sections_id_venue_uq').on(t.id, t.venueId),
  }),
);

export const rows = showsSchema.table('rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id')
    .notNull()
    .references(() => sections.id),
  number: integer('number').notNull(),
});

export const seats = showsSchema.table('seats', {
  id: uuid('id').primaryKey().defaultRandom(),
  rowId: uuid('row_id')
    .notNull()
    .references(() => rows.id),
  number: integer('number').notNull(),
});

export const shows = showsSchema.table(
  'shows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => organizers.id),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id),
    title: text('title').notNull().unique(),
    description: text('description').notNull().default(''),
    posterUrl: text('poster_url'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    saleStartsAt: timestamp('sale_starts_at', { withTimezone: true }),
    status: showStatusEnum('status').notNull().default('draft'),
  },
  (t) => ({
    idVenueUq: unique('shows_id_venue_uq').on(t.id, t.venueId),
  }),
);

// A price band, scoped to one show: two shows both selling "VIP" are two rows, so re-pricing
// one never touches the other. Which seats it covers is `show_section_pricing`, never a column here —
// one band can price several sections.
export const ticketTypes = showsSchema.table('ticket_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  showId: uuid('show_id')
    .notNull()
    .references(() => shows.id),
  name: text('name').notNull(),
  tier: seatTierEnum('tier').notNull().default('standard'),
  priceCents: integer('price_cents').notNull(),
  currency: text('currency').notNull().default('usd'),
});

/**
 * Which sections a show sells, and at which price band. The PK is the invariant: a section gets
 * exactly one ticket type per show. Many sections may point at one ticket type ("Balcony and
 * Loge are both VIP 300"); a section absent from this table is simply not on sale for the show.
 *
 * `venueId` is a copy of `shows.venueId`, carried purely so the two composite FKs below can pin
 * it to both parents at once — the show's venue and the section's venue must then be the same
 * venue. Without it nothing stops a show selling a section in a different building.
 */
export const showSectionPricing = showsSchema.table(
  'show_section_pricing',
  {
    showId: uuid('show_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    venueId: uuid('venue_id').notNull(),
    ticketTypeId: uuid('ticket_type_id')
      .notNull()
      .references(() => ticketTypes.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.showId, t.sectionId] }),
    showFk: foreignKey({
      columns: [t.showId, t.venueId],
      foreignColumns: [shows.id, shows.venueId],
      name: 'show_section_pricing_show_venue_fk',
    }),
    sectionFk: foreignKey({
      columns: [t.sectionId, t.venueId],
      foreignColumns: [sections.id, sections.venueId],
      name: 'show_section_pricing_section_venue_fk',
    }),
  }),
);
