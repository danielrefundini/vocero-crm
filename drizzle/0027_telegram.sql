CREATE TABLE "telegram_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"bot_id" text NOT NULL,
	"bot_username" text,
	"bot_name" text,
	"token_cipher" text NOT NULL,
	"token_iv" text NOT NULL,
	"token_tag" text NOT NULL,
	"webhook_secret_cipher" text NOT NULL,
	"webhook_secret_iv" text NOT NULL,
	"webhook_secret_tag" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_credentials" ADD CONSTRAINT "telegram_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_credentials_org_uq" ON "telegram_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_credentials_bot_id_uq" ON "telegram_credentials" USING btree ("bot_id");