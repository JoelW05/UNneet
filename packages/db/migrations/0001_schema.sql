CREATE TYPE "public"."cost_kind" AS ENUM('free', 'funded', 'paid', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."country" AS ENUM('england', 'scotland', 'wales', 'northern-ireland', 'uk');--> statement-breakpoint
CREATE TYPE "public"."ingest_status" AS ENUM('running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('live', 'expired', 'removed');--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('job', 'apprenticeship', 'traineeship', 'internship', 'course', 'bootcamp', 't-level', 'degree', 'volunteering', 'programme', 'support');--> statement-breakpoint
CREATE TYPE "public"."pay_unit" AS ENUM('hour', 'day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."pillar" AS ENUM('employment', 'education', 'training', 'support');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('north-east', 'north-west', 'yorkshire-and-the-humber', 'east-midlands', 'west-midlands', 'east-of-england', 'london', 'south-east', 'south-west', 'wales', 'scotland', 'northern-ireland');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('closed', 'scam', 'misleading', 'offensive', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewed', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."sector" AS ENUM('agriculture-environment-animal-care', 'business-administration', 'care-services', 'catering-hospitality', 'construction-built-environment', 'creative-design', 'digital', 'education-early-years', 'engineering-manufacturing', 'hair-beauty', 'health-science', 'legal-finance-accounting', 'protective-services', 'sales-marketing-procurement', 'transport-logistics');--> statement-breakpoint
CREATE TYPE "public"."storage_policy" AS ENUM('store', 'cache', 'live');--> statement-breakpoint
CREATE TYPE "public"."work_mode" AS ENUM('onsite', 'hybrid', 'remote', 'nationwide');--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"pillar" "pillar" NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"org_name" text NOT NULL,
	"org_url" text,
	"apply_url" text NOT NULL,
	"sector" "sector",
	"level" smallint,
	"min_entry_level" smallint,
	"experience_required" boolean,
	"location_label" text NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"postcode" text,
	"region" "region",
	"country" "country",
	"work_mode" "work_mode" DEFAULT 'onsite' NOT NULL,
	"pay_min" numeric(12, 2),
	"pay_max" numeric(12, 2),
	"pay_unit" "pay_unit",
	"pay_is_estimate" boolean DEFAULT false NOT NULL,
	"pay_note" text,
	"annual_pay_min" integer,
	"annual_pay_max" integer,
	"cost_kind" "cost_kind" DEFAULT 'unknown' NOT NULL,
	"cost_amount" numeric(12, 2),
	"cost_note" text,
	"is_free" boolean DEFAULT false NOT NULL,
	"duration" text,
	"posted_at" timestamp with time zone,
	"starts_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"min_age" smallint,
	"max_age" smallint,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "opportunity_status" DEFAULT 'live' NOT NULL,
	"content_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(org_name, '') || ' ' || coalesce(keywords, '')), 'B') ||
          setweight(to_tsvector('english', coalesce(summary, '')), 'C') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'D')) STORED
);
--> statement-breakpoint
CREATE TABLE "opportunity_skills" (
	"opportunity_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	CONSTRAINT "opportunity_skills_opportunity_id_skill_id_pk" PRIMARY KEY("opportunity_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"licence" text NOT NULL,
	"attribution" text NOT NULL,
	"attribution_url" text,
	"storage_policy" "storage_policy" NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"esco_uri" text
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"status" "ingest_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"seen" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"unchanged" integer DEFAULT 0 NOT NULL,
	"expired" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "partners_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"quiz_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_opportunities" (
	"user_id" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_opportunities_user_id_opportunity_id_pk" PRIMARY KEY("user_id","opportunity_id")
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_skills" ADD CONSTRAINT "opportunity_skills_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_skills" ADD CONSTRAINT "opportunity_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_results" ADD CONSTRAINT "quiz_results_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_opportunities" ADD CONSTRAINT "saved_opportunities_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_opportunities" ADD CONSTRAINT "saved_opportunities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_user" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_user" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_slug_uq" ON "opportunities" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_provider_external_uq" ON "opportunities" USING btree ("provider_id","external_id");--> statement-breakpoint
CREATE INDEX "opportunities_search_gin" ON "opportunities" USING gin ("search");--> statement-breakpoint
CREATE INDEX "opportunities_title_trgm" ON "opportunities" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "opportunities_geo_gist" ON "opportunities" USING gist (ll_to_earth("lat", "lon")) WHERE "opportunities"."lat" is not null and "opportunities"."lon" is not null;--> statement-breakpoint
CREATE INDEX "opportunities_live_filters" ON "opportunities" USING btree ("pillar","type","sector","level") WHERE "opportunities"."status" = 'live';--> statement-breakpoint
CREATE INDEX "opportunities_live_posted" ON "opportunities" USING btree ("posted_at" DESC NULLS LAST) WHERE "opportunities"."status" = 'live';--> statement-breakpoint
CREATE INDEX "opportunities_closes_at" ON "opportunities" USING btree ("closes_at");--> statement-breakpoint
CREATE INDEX "opportunities_provider_status" ON "opportunities" USING btree ("provider_id","status","last_seen_at");--> statement-breakpoint
CREATE INDEX "opportunity_skills_skill" ON "opportunity_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "ingest_runs_provider_started" ON "ingest_runs" USING btree ("provider_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_status_created" ON "reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "quiz_results_user_quiz" ON "quiz_results" USING btree ("user_id","quiz_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "saved_opportunities_user_created" ON "saved_opportunities" USING btree ("user_id","created_at" DESC NULLS LAST);