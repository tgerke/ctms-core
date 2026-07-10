-- Source-system → TMF filing interface (ADR-0011). 'ingest' is the machine-
-- identity role: read + upload only, never sign or approve. source_system /
-- source_ref record which system filed a version and its native reference;
-- null for human uploads. Additive only — versions are immutable.
ALTER TYPE "public"."access_role" ADD VALUE 'ingest';--> statement-breakpoint
ALTER TABLE "document_version" ADD COLUMN "source_system" text;--> statement-breakpoint
ALTER TABLE "document_version" ADD COLUMN "source_ref" text;