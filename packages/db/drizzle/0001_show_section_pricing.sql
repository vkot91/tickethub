CREATE TABLE IF NOT EXISTS "shows"."show_section_pricing" (
	"show_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	CONSTRAINT "show_section_pricing_show_id_section_id_pk" PRIMARY KEY("show_id","section_id")
);
--> statement-breakpoint
ALTER TABLE "shows"."sections" ADD CONSTRAINT "sections_id_venue_uq" UNIQUE("id","venue_id");--> statement-breakpoint
ALTER TABLE "shows"."shows" ADD CONSTRAINT "shows_id_venue_uq" UNIQUE("id","venue_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shows"."show_section_pricing" ADD CONSTRAINT "show_section_pricing_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "shows"."ticket_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shows"."show_section_pricing" ADD CONSTRAINT "show_section_pricing_show_venue_fk" FOREIGN KEY ("show_id","venue_id") REFERENCES "shows"."shows"("id","venue_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shows"."show_section_pricing" ADD CONSTRAINT "show_section_pricing_section_venue_fk" FOREIGN KEY ("section_id","venue_id") REFERENCES "shows"."sections"("id","venue_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
/*
 Carry the old ticket_types.section_id mappings over before the column goes. Two rows could
 previously claim the same (show, section) — the new PK cannot, so DISTINCT ON keeps the cheapest,
 which is what the seat map's old fallback ordering promised. Rows whose section belonged to a
 different venue than the show are dropped rather than migrated: they priced no seat before (the
 seat map only ever looked at the show's own venue) and the composite FKs would reject them now.
*/
INSERT INTO "shows"."show_section_pricing" ("show_id", "section_id", "venue_id", "ticket_type_id")
SELECT DISTINCT ON (tt."show_id", tt."section_id")
	tt."show_id", tt."section_id", sh."venue_id", tt."id"
FROM "shows"."ticket_types" tt
JOIN "shows"."shows" sh ON sh."id" = tt."show_id"
JOIN "shows"."sections" sec ON sec."id" = tt."section_id" AND sec."venue_id" = sh."venue_id"
WHERE tt."section_id" IS NOT NULL
ORDER BY tt."show_id", tt."section_id", tt."price_cents" ASC, tt."id" ASC;
--> statement-breakpoint
ALTER TABLE "shows"."ticket_types" DROP CONSTRAINT IF EXISTS "ticket_types_section_id_sections_id_fk";--> statement-breakpoint
ALTER TABLE "shows"."ticket_types" DROP COLUMN IF EXISTS "section_id";--> statement-breakpoint
ALTER TABLE "shows"."ticket_types" DROP COLUMN IF EXISTS "quota";
