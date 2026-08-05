ALTER TABLE "shows"."ticket_types" RENAME TO "price_bands";--> statement-breakpoint
ALTER TABLE "shows"."show_section_pricing" RENAME COLUMN "ticket_type_id" TO "price_band_id";--> statement-breakpoint
ALTER TABLE "orders"."seat_reservations" RENAME COLUMN "ticket_type_id" TO "price_band_id";--> statement-breakpoint
ALTER TABLE "shows"."show_section_pricing" RENAME CONSTRAINT "show_section_pricing_ticket_type_id_ticket_types_id_fk" TO "show_section_pricing_price_band_id_price_bands_id_fk";--> statement-breakpoint
ALTER TABLE "shows"."price_bands" RENAME CONSTRAINT "ticket_types_show_id_shows_id_fk" TO "price_bands_show_id_shows_id_fk";--> statement-breakpoint
ALTER INDEX "shows"."show_section_pricing_ticket_type_idx" RENAME TO "show_section_pricing_price_band_idx";
