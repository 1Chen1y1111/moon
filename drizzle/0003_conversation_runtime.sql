DROP TABLE IF EXISTS "message_plugins" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "tool_invocations" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "messages" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "message_groups" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "agent_operations" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "threads" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "topics" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "sessions" CASCADE;
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"project_id" text,
	"provider" text NOT NULL,
	"title" text,
	"description" text,
	"avatar" text,
	"background_color" text,
	"type" text DEFAULT 'agent',
	"status" text NOT NULL,
	"user_id" text NOT NULL,
	"group_id" text,
	"client_id" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"title" text,
	"favorite" boolean DEFAULT false NOT NULL,
	"content" text,
	"editor_data" jsonb,
	"agent_id" text,
	"group_id" text,
	"user_id" text NOT NULL,
	"client_id" text,
	"description" text,
	"history_summary" text,
	"metadata" jsonb,
	"trigger" text,
	"mode" text,
	"status" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"content" text,
	"editor_data" jsonb,
	"type" text NOT NULL,
	"status" text,
	"topic_id" text NOT NULL,
	"source_message_id" text,
	"parent_thread_id" text,
	"client_id" text,
	"agent_id" text,
	"group_id" text,
	"metadata" jsonb,
	"user_id" text NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text,
	"topic_id" text,
	"thread_id" text NOT NULL,
	"task_id" text,
	"chat_group_id" text,
	"parent_operation_id" text,
	"status" text NOT NULL,
	"completion_reason" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"step_count" integer,
	"max_steps" integer,
	"force_finish" boolean,
	"interruption" jsonb,
	"error" jsonb,
	"total_cost" numeric(18, 8),
	"currency" text DEFAULT 'USD' NOT NULL,
	"total_input_tokens" integer,
	"total_output_tokens" integer,
	"total_tokens" integer,
	"llm_calls" integer,
	"tool_calls" integer,
	"human_interventions" integer,
	"processing_time_ms" integer,
	"human_waiting_time_ms" integer,
	"cost" jsonb,
	"usage" jsonb,
	"cost_limit" jsonb,
	"model" text,
	"provider" text,
	"model_runtime_config" jsonb,
	"trigger" text,
	"app_context" jsonb,
	"trace_s3_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text,
	"user_id" text NOT NULL,
	"parent_group_id" text,
	"parent_message_id" text,
	"title" text,
	"description" text,
	"type" text,
	"content" text,
	"editor_data" jsonb,
	"metadata" jsonb,
	"client_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"thread_id" text,
	"parent_id" text,
	"operation_id" text,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"editor_data" jsonb,
	"summary" text,
	"reasoning" jsonb,
	"search" jsonb,
	"metadata" jsonb,
	"favorite" boolean DEFAULT false NOT NULL,
	"error" jsonb,
	"tools" jsonb,
	"trace_id" text,
	"observation_id" text,
	"client_id" text,
	"user_id" text NOT NULL,
	"quota_id" text,
	"agent_id" text,
	"group_id" text,
	"target_id" text,
	"message_group_id" text,
	"status" text NOT NULL,
	"provider" text,
	"model" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_plugins" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_call_id" text,
	"type" text DEFAULT 'default',
	"intervention" jsonb,
	"api_name" text,
	"arguments" text,
	"identifier" text,
	"state" jsonb,
	"error" jsonb,
	"client_id" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_operations" ADD CONSTRAINT "agent_operations_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_operations" ADD CONSTRAINT "agent_operations_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_groups" ADD CONSTRAINT "message_groups_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_operation_id_agent_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."agent_operations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_message_group_id_message_groups_id_fk" FOREIGN KEY ("message_group_id") REFERENCES "public"."message_groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_plugins" ADD CONSTRAINT "message_plugins_id_messages_id_fk" FOREIGN KEY ("id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "slug_user_id_unique" ON "sessions" USING btree ("slug", "user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_client_id_user_id_unique" ON "sessions" USING btree ("client_id", "user_id");
--> statement-breakpoint
CREATE INDEX "sessions_project_id_idx" ON "sessions" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "sessions_id_user_id_idx" ON "sessions" USING btree ("id", "user_id");
--> statement-breakpoint
CREATE INDEX "sessions_user_id_updated_at_idx" ON "sessions" USING btree ("user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "sessions_group_id_idx" ON "sessions" USING btree ("group_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "topics_client_id_user_id_unique" ON "topics" USING btree ("client_id", "user_id");
--> statement-breakpoint
CREATE INDEX "topics_user_id_idx" ON "topics" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "topics_id_user_id_idx" ON "topics" USING btree ("id", "user_id");
--> statement-breakpoint
CREATE INDEX "topics_session_id_idx" ON "topics" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "topics_group_id_idx" ON "topics" USING btree ("group_id");
--> statement-breakpoint
CREATE INDEX "topics_agent_id_idx" ON "topics" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX "topics_trigger_idx" ON "topics" USING btree ("trigger");
--> statement-breakpoint
CREATE INDEX "topics_status_idx" ON "topics" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "topics_user_id_completed_at_idx" ON "topics" USING btree ("user_id", "completed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "threads_client_id_user_id_unique" ON "threads" USING btree ("client_id", "user_id");
--> statement-breakpoint
CREATE INDEX "threads_user_id_idx" ON "threads" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "threads_topic_id_idx" ON "threads" USING btree ("topic_id");
--> statement-breakpoint
CREATE INDEX "threads_type_idx" ON "threads" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "threads_agent_id_idx" ON "threads" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX "threads_group_id_idx" ON "threads" USING btree ("group_id");
--> statement-breakpoint
CREATE INDEX "threads_parent_thread_id_idx" ON "threads" USING btree ("parent_thread_id");
--> statement-breakpoint
CREATE INDEX "agent_operations_user_id_idx" ON "agent_operations" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "agent_operations_agent_id_idx" ON "agent_operations" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX "agent_operations_topic_id_idx" ON "agent_operations" USING btree ("topic_id");
--> statement-breakpoint
CREATE INDEX "agent_operations_thread_id_idx" ON "agent_operations" USING btree ("thread_id");
--> statement-breakpoint
CREATE INDEX "agent_operations_task_id_idx" ON "agent_operations" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX "agent_operations_chat_group_id_idx" ON "agent_operations" USING btree ("chat_group_id");
--> statement-breakpoint
CREATE INDEX "agent_operations_parent_operation_id_idx" ON "agent_operations" USING btree ("parent_operation_id");
--> statement-breakpoint
CREATE INDEX "agent_operations_status_idx" ON "agent_operations" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "agent_operations_user_id_created_at_idx" ON "agent_operations" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "agent_operations_metadata_idx" ON "agent_operations" USING gin ("metadata");
--> statement-breakpoint
CREATE UNIQUE INDEX "message_groups_client_id_user_id_unique" ON "message_groups" USING btree ("client_id", "user_id");
--> statement-breakpoint
CREATE INDEX "message_groups_user_id_idx" ON "message_groups" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "message_groups_topic_id_idx" ON "message_groups" USING btree ("topic_id");
--> statement-breakpoint
CREATE INDEX "message_groups_type_idx" ON "message_groups" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "message_groups_parent_group_id_idx" ON "message_groups" USING btree ("parent_group_id");
--> statement-breakpoint
CREATE INDEX "message_groups_parent_message_id_idx" ON "message_groups" USING btree ("parent_message_id");
--> statement-breakpoint
CREATE INDEX "messages_session_id_idx" ON "messages" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "messages_topic_id_idx" ON "messages" USING btree ("topic_id");
--> statement-breakpoint
CREATE INDEX "messages_thread_id_idx" ON "messages" USING btree ("thread_id");
--> statement-breakpoint
CREATE INDEX "messages_parent_id_idx" ON "messages" USING btree ("parent_id");
--> statement-breakpoint
CREATE INDEX "messages_quota_id_idx" ON "messages" USING btree ("quota_id");
--> statement-breakpoint
CREATE INDEX "messages_operation_id_idx" ON "messages" USING btree ("operation_id");
--> statement-breakpoint
CREATE INDEX "messages_user_id_idx" ON "messages" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "messages_agent_id_idx" ON "messages" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX "messages_group_id_idx" ON "messages" USING btree ("group_id");
--> statement-breakpoint
CREATE INDEX "messages_message_group_id_idx" ON "messages" USING btree ("message_group_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "message_client_id_user_unique" ON "messages" USING btree ("client_id", "user_id");
--> statement-breakpoint
CREATE INDEX "messages_content_search_idx" ON "messages" USING gin (to_tsvector('simple', "content"));
--> statement-breakpoint
CREATE UNIQUE INDEX "message_plugins_client_id_user_id_unique" ON "message_plugins" USING btree ("client_id", "user_id");
--> statement-breakpoint
CREATE INDEX "message_plugins_user_id_idx" ON "message_plugins" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "message_plugins_tool_call_id_idx" ON "message_plugins" USING btree ("tool_call_id");
