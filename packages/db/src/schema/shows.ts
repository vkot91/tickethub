import { pgSchema, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const showsSchema = pgSchema('shows');
export const showStatusEnum = showsSchema.enum('show_status', [
  'draft',
  'published',
  'cancelled',
  'finished',
]);

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

export const sections = showsSchema.table('sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id')
    .notNull()
    .references(() => venues.id),
  name: text('name').notNull(),
});

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

export const shows = showsSchema.table('shows', {
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
});

export const ticketTypes = showsSchema.table('ticket_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  showId: uuid('show_id')
    .notNull()
    .references(() => shows.id),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  currency: text('currency').notNull().default('usd'),
  quota: integer('quota'), // NULL = seated; number = GA
});
