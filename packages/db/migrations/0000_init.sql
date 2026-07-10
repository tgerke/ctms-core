CREATE TYPE "public"."document_status" AS ENUM('pending_review', 'effective', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."org_kind" AS ENUM('sponsor', 'cro', 'site_org');--> statement-breakpoint
CREATE TYPE "public"."role_kind" AS ENUM('principal_investigator', 'sub_investigator', 'study_coordinator', 'pharmacist', 'research_nurse');--> statement-breakpoint
CREATE TYPE "public"."scope_level" AS ENUM('study', 'study_site', 'person_role');--> statement-breakpoint
CREATE TYPE "public"."signature_meaning" AS ENUM('author', 'review', 'approval');--> statement-breakpoint
CREATE TYPE "public"."study_site_status" AS ENUM('pending', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."study_status" AS ENUM('planning', 'active', 'closed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"prev_hash" char(64) NOT NULL,
	"hash" char(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmf_artifact_id" integer NOT NULL,
	"study_id" uuid NOT NULL,
	"study_site_id" uuid,
	"person_id" uuid,
	"title" text NOT NULL,
	"status" "document_status" DEFAULT 'pending_review' NOT NULL,
	"effective_date" date,
	"expires_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expected_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"study_id" uuid NOT NULL,
	"study_site_id" uuid,
	"person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "org_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"given_name" text NOT NULL,
	"family_name" text NOT NULL,
	"email" text NOT NULL,
	"credentials" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "protocol_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"label" text NOT NULL,
	"effective_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requirement_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"tmf_artifact_id" integer NOT NULL,
	"scope_level" "scope_level" NOT NULL,
	"applies_to_roles" text[],
	"validity_months" integer,
	"requires_signature" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_version_id" uuid NOT NULL,
	"signer_person_id" uuid NOT NULL,
	"meaning" "signature_meaning" NOT NULL,
	"signed_sha256" char(64) NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_number" text NOT NULL,
	"title" text NOT NULL,
	"phase" text,
	"status" "study_status" DEFAULT 'planning' NOT NULL,
	"sponsor_org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_protocol_number_unique" UNIQUE("protocol_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"site_number" text NOT NULL,
	"status" "study_site_status" DEFAULT 'pending' NOT NULL,
	"activated_at" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_site_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_site_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "role_kind" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tmf_artifact" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"purpose" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tmf_section" (
	"id" serial PRIMARY KEY NOT NULL,
	"zone_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tmf_zone" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tmf_zone_number_unique" UNIQUE("number")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document" ADD CONSTRAINT "document_tmf_artifact_id_tmf_artifact_id_fk" FOREIGN KEY ("tmf_artifact_id") REFERENCES "public"."tmf_artifact"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document" ADD CONSTRAINT "document_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document" ADD CONSTRAINT "document_study_site_id_study_site_id_fk" FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document" ADD CONSTRAINT "document_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_version" ADD CONSTRAINT "document_version_uploaded_by_person_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expected_document" ADD CONSTRAINT "expected_document_rule_id_requirement_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."requirement_rule"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expected_document" ADD CONSTRAINT "expected_document_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expected_document" ADD CONSTRAINT "expected_document_study_site_id_study_site_id_fk" FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expected_document" ADD CONSTRAINT "expected_document_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "protocol_version" ADD CONSTRAINT "protocol_version_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requirement_rule" ADD CONSTRAINT "requirement_rule_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requirement_rule" ADD CONSTRAINT "requirement_rule_tmf_artifact_id_tmf_artifact_id_fk" FOREIGN KEY ("tmf_artifact_id") REFERENCES "public"."tmf_artifact"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature" ADD CONSTRAINT "signature_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature" ADD CONSTRAINT "signature_signer_person_id_person_id_fk" FOREIGN KEY ("signer_person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "site" ADD CONSTRAINT "site_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study" ADD CONSTRAINT "study_sponsor_org_id_organization_id_fk" FOREIGN KEY ("sponsor_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_site" ADD CONSTRAINT "study_site_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_site" ADD CONSTRAINT "study_site_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_site_role" ADD CONSTRAINT "study_site_role_study_site_id_study_site_id_fk" FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_site_role" ADD CONSTRAINT "study_site_role_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tmf_artifact" ADD CONSTRAINT "tmf_artifact_section_id_tmf_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."tmf_section"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tmf_section" ADD CONSTRAINT "tmf_section_zone_id_tmf_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."tmf_zone"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_event_entity_idx" ON "audit_event" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_study_idx" ON "document" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_site_idx" ON "document" USING btree ("study_site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_artifact_idx" ON "document" USING btree ("tmf_artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_version_number_idx" ON "document_version" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expected_document_site_idx" ON "expected_document" USING btree ("study_site_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "protocol_version_label_idx" ON "protocol_version" USING btree ("study_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "study_site_pair_idx" ON "study_site" USING btree ("study_id","site_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "study_site_number_idx" ON "study_site" USING btree ("study_id","site_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_site_role_person_idx" ON "study_site_role" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tmf_artifact_code_idx" ON "tmf_artifact" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tmf_section_code_idx" ON "tmf_section" USING btree ("code");