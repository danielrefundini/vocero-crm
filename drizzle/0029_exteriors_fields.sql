ALTER TABLE "calendar_settings" ALTER COLUMN "timezone" SET DEFAULT 'America/New_York';--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "property_address" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "address_street" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "address_city" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "address_state" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "address_zip" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "services" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "quote_date" date;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "brand" text;