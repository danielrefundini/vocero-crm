CREATE TABLE "calendar_account" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"email" text NOT NULL,
	"refresh_token_cipher" text NOT NULL,
	"refresh_token_iv" text NOT NULL,
	"refresh_token_tag" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"write_bookings" boolean DEFAULT false NOT NULL,
	"block_busy" boolean DEFAULT true NOT NULL,
	"show_events" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "calendar_account_id" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "calendar_event_id" text;--> statement-breakpoint
ALTER TABLE "calendar_account" ADD CONSTRAINT "calendar_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_account_org_email_uq" ON "calendar_account" USING btree ("organization_id","provider","email");