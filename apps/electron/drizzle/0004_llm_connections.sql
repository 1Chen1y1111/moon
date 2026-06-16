CREATE TABLE "llm_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider_id" text,
	"backend" text NOT NULL,
	"model" text NOT NULL,
	"encrypted_api_key" text DEFAULT '' NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"custom_endpoint" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"thinking_level" text DEFAULT 'medium' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "llm_connection_id" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_llm_connection_id_llm_connections_id_fk" FOREIGN KEY ("llm_connection_id") REFERENCES "public"."llm_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "llm_connections_enabled_idx" ON "llm_connections" USING btree ("enabled");
--> statement-breakpoint
CREATE INDEX "llm_connections_is_default_idx" ON "llm_connections" USING btree ("is_default");
--> statement-breakpoint
CREATE INDEX "llm_connections_provider_id_idx" ON "llm_connections" USING btree ("provider_id");
--> statement-breakpoint
CREATE INDEX "sessions_llm_connection_id_idx" ON "sessions" USING btree ("llm_connection_id");
