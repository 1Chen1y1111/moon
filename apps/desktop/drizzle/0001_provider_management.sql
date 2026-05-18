ALTER TABLE "provider_settings" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "provider_type" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "models" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "available_models" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "api_format" text DEFAULT 'openai-chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "use_max_completion_tokens" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "custom_headers" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "is_custom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "is_acp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "is_oauth" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "acp_command" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "acp_args" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "acp_auth_method_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD COLUMN "models_updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "provider_settings" SET "name" = "provider" WHERE "name" = '';
