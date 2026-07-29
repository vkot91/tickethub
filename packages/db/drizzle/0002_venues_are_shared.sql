ALTER TABLE "shows"."venues" DROP CONSTRAINT "venues_organizer_id_organizers_id_fk";
--> statement-breakpoint
ALTER TABLE "shows"."venues" DROP COLUMN IF EXISTS "organizer_id";--> statement-breakpoint
ALTER TABLE "shows"."venues" ADD CONSTRAINT "venues_name_unique" UNIQUE("name");