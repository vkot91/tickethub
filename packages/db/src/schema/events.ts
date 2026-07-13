import { pgSchema, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const eventsSchema = pgSchema('events');
export const eventStatusEnum = eventsSchema.enum('event_status', [
  'draft',
  'published',
  'cancelled',
  'finished',
]);

export const organizers = eventsSchema.table('organizers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(), // logical FK to auth.users
  name: text('name').notNull(),
});

export const venues = eventsSchema.table('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizerId: uuid('organizer_id')
    .notNull()
    .references(() => organizers.id),
  name: text('name').notNull(),
  address: text('address'),
  city: text('city'),
});

export const sections = eventsSchema.table('sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id')
    .notNull()
    .references(() => venues.id),
  name: text('name').notNull(),
});

export const rows = eventsSchema.table('rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id')
    .notNull()
    .references(() => sections.id),
  number: integer('number').notNull(),
});

export const seats = eventsSchema.table('seats', {
  id: uuid('id').primaryKey().defaultRandom(),
  rowId: uuid('row_id')
    .notNull()
    .references(() => rows.id),
  number: integer('number').notNull(),
});

export const events = eventsSchema.table('events', {
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
  status: eventStatusEnum('status').notNull().default('draft'),
});

export const ticketTypes = eventsSchema.table('ticket_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  currency: text('currency').notNull().default('usd'),
  quota: integer('quota'), // NULL = seated; number = GA
});
