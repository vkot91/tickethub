ALTER TABLE "shows"."shows" DROP CONSTRAINT "shows_title_unique";--> statement-breakpoint
ALTER TABLE "shows"."shows" ADD CONSTRAINT "shows_venue_title_slot_uq" UNIQUE("venue_id","title","starts_at");