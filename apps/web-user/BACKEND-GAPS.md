# Backend work the web app needs (Phase 5)

The frontend is being built first, against the API as it exists today. This file is the
running list of everything `apps/web` needs from the backend and does not yet have.

Each item names the service that owns it, the shape the UI expects, and which screen is
blocked without it. Contract constants follow the flat `<SCOPE>_<KIND>` / `SCREAMING_SNAKE`
convention; all new payload schemas belong in `packages/contracts`.

Legend: **blocking** = the screen cannot ship without it. **degraded** = the screen ships,
but with fields missing or faked.

## Status index

| §   | Item                               | Status                                                       | Tracked in                     |
| --- | ---------------------------------- | ------------------------------------------------------------ | ------------------------------ |
| 1   | Catalog / show detail extra fields | **open** — degraded                                          | here                           |
| 2   | Seat map                           | **partly done** — pricing landed, availability still missing | here                           |
| 3   | Real-time seat updates             | **open** — 3s polling fallback shipped                       | here                           |
| 3b  | Checkout line items                | **open** — degraded                                          | here                           |
| 4   | My orders                          | ✅ **done**                                                  | —                              |
| 5   | My tickets                         | ✅ **done**                                                  | —                              |
| 6   | Organizer: show CRUD               | **specced, not built**                                       | `docs/10-organizer-console.md` |
| 7   | Organizer: sales stats             | **specced, not built**                                       | `docs/10-organizer-console.md` |
| 8   | Check-in                           | **specced, not built**                                       | `docs/10-organizer-console.md` |
| 9   | Cross-cutting notes                | reference                                                    | here                           |

`docs/10-organizer-console.md` is the full spec for §6–§8 — screens for Claude Design, then
migrations, contracts, RPCs, gateway routes, slices and tests for implementation. It also adds
**venue / section / row / seat CRUD**, which none of the sections below anticipated: seats are
venue furniture in the schema, so an organizer cannot create a show without first building a
hall. §6–§8 below are kept only as a short summary pointing at that doc, with their stale
claims corrected.

---

## 1. Catalog and show detail — degraded

`GET /shows` and `GET /shows/:id` return only `id, title, startsAt, posterUrl, status`
(plus `description, venueId` on detail). The design's catalog card and show page show more.

| Field the design needs                          | Where it must come from                                                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `venueName`, `city`                             | `shows` service — join `venues`, or denormalise onto the show row                                                                              |
| `doorsAt`                                       | new column on `shows` (the design shows DATE **and** DOORS)                                                                                    |
| `category` (`Concert`, `Club night`, `Theatre`) | new column + enum in contracts                                                                                                                 |
| `act` / subtitle line                           | new column on `shows`                                                                                                                          |
| `priceFrom` (cheapest tier, integer cents)      | aggregate over the show's price tiers — `showDetailSchema.priceTiers` already carries them per show; the catalog needs the same on the summary |
| `soldOut` / `fewLeft` derivation                | read model over `seat_reservations`, or a counter on the show row                                                                              |

Until this lands the catalog renders title + date + status only, and the show page prints
`venueId` where the venue name belongs.

**Suggested shape** — extend `showSummarySchema` / `showDetailSchema` in
`packages/contracts/src/dto/shows.ts` rather than adding a parallel schema.

> Already added on the frontend side: `catalogPageSchema` (`{ items, nextCursor }`), which
> is what `SHOWS_MESSAGE_PATTERNS.CATALOG` already returns but never had a schema for.

> `venueName` is the one field here that `docs/10-organizer-console.md` incidentally unblocks:
> the organizer show list already joins `venues`, so exposing the name on the public detail is
> a one-line extension of a query that will exist.

## 2. Seat map — partly done

`GET /shows/:id/seat-map` returns geometry **plus pricing**:
`{ showId, sections: [{ id, name, rows: [{ id, number, seats: [{ id, number, ticketTypeId, priceCents, tier }] }] }] }`.

**Still missing — blocking for a correct seat map:**

- `status`: `'available' | 'held' | 'sold'` per seat — derived from active `seat_reservations`
  and paid orders. Without it every seat renders as available and the first click 409s. This is
  the only remaining gap in this section.

**Done, and now real** — `ticketTypeId`, `priceCents` and `tier` per seat, all three null when
nothing covers the seat. The client derives none of them; the old row-number band (A–B / C–E /
F–H) is deleted.

> **Correction.** An earlier revision of this file said pricing was resolved through a
> `ticket_types.section_id` column. That column does not exist and never did. The section →
> price-band link is the **`show_section_pricing`** table: PK `(show_id, section_id)`, one band per
> section per show, with two composite FKs pinning the show and the section to the same venue.
> A section absent from `show_section_pricing` is simply not on sale. There is no show-wide fallback
> ticket type — `seatMap` joins through `show_section_pricing`, so an unpriced section does not appear
> in the map at all.

Pricing is per _section_, not per row: a section needing two prices would want
`ticket_types.row_id` or a `tiers` table, neither of which anything asks for yet.

`ticket_types` is the price source of truth end to end: the seat map returns the `priceCents`
orders charges, `GET /shows/:id` returns the show's bands as `priceTiers` (dearest first), and
the seeder prices its demo orders through the same lookup. Nothing in `apps/web` computes a
price or a band; `features/seat-map/pricing.ts` is gone, replaced by `lib/format/tiers.ts`,
which holds only wording and colour for the shared `SeatTier` enum in `packages/contracts`.

**What the frontend does about the missing `status`:**

- `features/seat-map/model.ts` holds the view model — `SeatStatus` per seat.
  `toSeatMapView(seatMap, statuses)` takes the availability layer as a second argument, so
  wiring real data is a one-line change at the call site. When the endpoint returns the field,
  move `SeatStatus` into `packages/contracts` and delete the adapter's derivation.
- Every seat renders as available, so the held-seat pulse and the sold state are implemented
  and unit-tested but never triggered by real data yet.

## 3. Real-time seat updates — blocking (slice 3)

Socket.IO namespace on `apps/gateway`, consuming `seat.held` / `seat.released` (and
`order.paid`) from RMQ and fanning out to a per-`showId` room.

- Client joins `show:<showId>` on mount, leaves on unmount.
- Payload carries `seatIds` + the new status; the socket is a cache-invalidation channel,
  never the only source of a fact.
- Auth: the socket handshake must accept the same JWT the REST calls use (the browser holds
  it only as an httpOnly cookie, so the gateway has to read it from the cookie header, or
  the web BFF has to mint a short-lived socket ticket).

Fallback if this slips: TanStack Query `refetchInterval` ≈ 3s on the seat map. Checkout is
not blocked either way.

**Currently in place**: the fallback. `SEAT_MAP_POLL_MS` in `features/seat-map/api.ts` polls
every 3s, and `refetchOnReconnect` is on globally. Swapping to the socket means subscribing
to the room and patching `seatMapKeys.byShow(showId)` — the query key is already namespaced
for it, and nothing else in the component needs to change.

## 3b. Checkout — degraded

`GET /orders/:id` returns `{ id, status, totalCents, currency, expiresAt }` — enough to run
checkout, and slice 4 is built and tested on it. What the design's order summary shows and the
endpoint does not carry:

- per-seat line items (`seatLabel`, `tier`, `priceCents`) — the summary currently shows the
  order total alone rather than a breakdown;
- the show's title and date, to head the summary;
- the subtotal / 8% service fee split. The frontend deliberately does **not** compute the fee
  itself: `totalCents` is the number being charged, and inventing a split risks displaying a
  breakdown that does not add up to it.

`POST /payments/intent` needs nothing — it already returns the client secret and amount.

## 4. My orders — **done**

`GET /orders` — the caller's own orders, cursor-paginated, newest first — exists.

- `ORDERS_MESSAGE_PATTERNS.LIST` RPC on `apps/orders` + `@Get()` on the gateway's orders
  controller, behind the existing `JwtAuthGuard`.
- Keyset pagination on `(created_at, id)`, not an offset: an order created while the reader
  pages would otherwise shift the window and repeat a row. The cursor is the last item's id
  and must belong to the caller — anything else is a 400, not a silently empty page.
- Unlike `GET /orders/:id`, the list returns **held** reservations too, so an
  `awaiting_payment` order still shows its seats.
- `showTitle` and `seatLabels` live in Shows, so the **gateway fans out** — `shows.detail` +
  `shows.seatMap`, once per distinct show on the page, not once per order. A show that has
  been purged degrades to `"Unavailable show"` with no labels rather than failing the page.
  Denormalising the title onto the order and the label onto the reservation at creation time
  is still the faster shape if this page ever gets slow.

`orderListQuerySchema`, `orderSummarySchema`, `orderListItemSchema`, and `orderListSchema` now
live in `packages/contracts/src/orders`; `features/orders/api.ts` imports them and no longer
declares its own.

`POST /orders/:id/refund` **does** exist and the refund button is wired to the real thing,
including the confirm dialog and the "wait for Stripe" invalidation.

## 5. My tickets — **done**

`GET /tickets` — the caller's tickets, **one per seat** (not per paid order: a gate scanner
admits one seat at a time, and check-in is per ticket).

- RPC on `apps/fulfillment`; gateway route behind `JwtAuthGuard`.
- `pdfUrl` is a **stable gateway-relative path** (`/tickets/:id/pdf`), not a signed URL. That
  endpoint authorizes the caller and 302s to a 60-second presigned URL minted at click time — so
  ownership is checked on the click rather than when the list was rendered, and no perishable
  credential enters a cacheable response.
- `qrToken` is the HMAC token the fulfillment service generates; the card renders a real
  scannable QR from it client-side (`qrcode.react`) rather than downloading the PDF to show a QR.
- `pdfUrl` is treated as nullable: a paid order whose PDF has not landed yet shows "PDF is
  still being generated" rather than a dead link.

> `venueName` is still `null`: `shows.detail` carries `venueId`, and no RPC returns a venue name
> yet. See §1 — the organizer console's venue join makes this cheap to expose.

---

## 6. Organizer: show CRUD — **specced in `docs/10-organizer-console.md`**

Still not implemented. The spec supersedes the sketch that used to live here; the corrections
that matter:

- **`shows.organizer_id` already exists** and is `NOT NULL`. This section previously called it a
  missing prerequisite. It is not — ownership filtering can be written today.
- The real prerequisite is different: **nothing can create a `shows.organizers` row** outside
  the seed script, and registration always yields `role: 'user'`. The spec adds
  `POST /auth/become-organizer` plus a lazy upsert of the organizer row on first write.
- **Venues, sections, rows and seats need their own CRUD**, which this section never mentioned.
  Seats belong to the venue, so "create a show" is meaningless until the organizer has built a
  hall. That is the largest slice of the new spec, and a whole new screen (a structural seat
  editor) that `design/README.md` does not cover.
- `DELETE /shows/:id` is a transition to `cancelled` (mass refund via the existing
  `show.cancelled` consumer), never a row delete — **except** for drafts, which are hard-deleted
  since nothing can reference them.
- `shows.title` has a **global `UNIQUE`** today, so two organizers cannot both run "Summer Fest".
  The spec migrates it to `UNIQUE(organizer_id, title)`.
- Pricing gets one draft-only transactional endpoint, `PUT /shows/:id/pricing`, replacing
  `ticket_types` + `show_section_pricing` wholesale. After publish, pricing and seating freeze; only
  title, description, poster and sale start stay editable.

**Frontend state**: `features/organizer/api.ts` already calls `GET /shows?organizer=me`,
`POST /shows`, `PATCH /shows/:id` and `DELETE /shows/:id`, and declares `updateShowSchema`
locally. Move it to `packages/contracts` when the RPC lands. The query-param form
`?organizer=me` is the one the spec implements, so no client change is needed there.

## 7. Organizer: sales stats — **specced in `docs/10-organizer-console.md`**

Still not implemented. `GET /shows/:id/stats` and `GET /orders/recent`, both gateway fan-outs.

The problem this section did not name: **`apps/orders` does not know who owns a show.**
`organizer_id` lives only in the `shows` schema and cross-service JOINs are forbidden. The spec
adds a `shows.myShowIds({ userId })` RPC; the gateway resolves it first and passes explicit
`showIds` into the orders aggregate, so orders never reasons about ownership. Same mechanism
guards §8.

Stats are a **live aggregate** (`GROUP BY date_trunc('day', created_at)` over orders, plus a
seat count from shows for `capacity`), not a materialised read model — with a new index on
`orders(show_id, created_at)`. The `byDay` range is a query param, driving the design's
"Last 7 days" chip.

`buyerEmail` on the recent-orders table comes from a new batched `auth.getUsersByIds`, merged
at the gateway — one call per page. Emails are never copied into the orders schema. A deleted
user degrades to "Unknown buyer". The endpoint is scoped to the caller's own `showIds`, which
is what stops it leaking buyer emails across organizers.

**Frontend state**: `showStatsSchema` and `recentOrderSchema` are declared locally in
`features/organizer/api.ts`. The spec's versions add `checkedInCount` and `byTier` to the
former and `createdAt` plus a nullable `buyerEmail` to the latter.

## 8. Check-in — **specced in `docs/10-organizer-console.md`**

Still not implemented, but it needs **no schema change**: `fulfillment.tickets` already has
`show_id`, `qr_token` and `checked_in_at`.

- Route is `POST /tickets/check-in { code }` — the scanner holds the QR's HMAC token, not a
  ticket id. Keying check-in by a signed code rather than a guessable id is also the safer of
  the two.
- Atomic and idempotent: a single
  `UPDATE ... SET checked_in_at = now() WHERE qr_token = $1 AND show_id = ANY($2) AND checked_in_at IS NULL`.
  1 row = `valid`; 0 rows disambiguates to `invalid` / `used` / `notYours` with one follow-up
  select.
- `checkInResultSchema` gains a **fourth** result, `notYours`, for a ticket belonging to a show
  the caller does not organize. The local union in `features/organizer/api.ts` must widen from
  three values.
- `checked_in_gate` is **not** being added — the app has no gate concept, so the design's
  "at Gate B" copy becomes a plain relative time.
- Needs an integration test on the throwaway `TEST_DATABASE_URL` database: two concurrent scans
  of the same ticket, exactly one `valid`.

**Also flagged by the spec**: two seat-label formats exist today — the gateway's `"A2"`
(`orders.controller.ts`) and fulfillment's `"Parterre 1-1"` (`tickets.seat_label`). The scanner
would show one next to a dashboard showing the other. The spec unifies on
`"<Section> <RowLetter><Seat>"` in `packages/common`; existing snapshotted labels keep their
old value.

## 9. Cross-cutting

- **CORS / cookies**: the browser never calls the gateway directly — all traffic goes through
  the web BFF (`/api/gateway/[...path]`), so no CORS config is needed. Keep it that way.
  **One exception is coming**: the organizer's poster upload `PUT`s straight to MinIO from a
  presigned URL, so the `posters` bucket needs CORS for `PUT` from the web origin.
- **Refresh endpoint contract**: `POST /auth/refresh` currently returns a full token pair.
  The BFF proxy depends on that (it re-sets both cookies after a 401 retry). Do not change it
  to return only an access token without updating `app/api/gateway/[...path]/route.ts`.
  `POST /auth/become-organizer` returns a pair for the same reason — the caller's JWT still
  says `user` after the role flip.
- **Error bodies**: the frontend maps status codes to a typed union
  (`unauthorized | forbidden | notFound | conflict | expired | validation | unknown`). A 409
  whose message contains "expired" is read as `expired`. A dedicated `410 Gone` for expired
  orders would be cleaner than pattern-matching the message.
- **Ownership returns 404, not 403.** Per the organizer spec, a venue or show that exists but
  belongs to someone else is a 404, so an organizer cannot probe for a competitor's show by id.
  The frontend's `notFound` branch already handles it.
