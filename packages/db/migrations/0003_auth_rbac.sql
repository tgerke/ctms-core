CREATE TYPE "public"."access_role" AS ENUM('admin', 'trial_ops', 'monitor', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."reauth_method" AS ENUM('oidc_fresh_token', 'dev_token', 'seed_fixture');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "access_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "access_role" NOT NULL,
	"study_id" uuid,
	"study_site_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "signature" ADD COLUMN "reauth_method" "reauth_method";--> statement-breakpoint
ALTER TABLE "signature" ADD COLUMN "reauth_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_study_site_id_study_site_id_fk" FOREIGN KEY ("study_site_id") REFERENCES "public"."study_site"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_grant_person_idx" ON "access_grant" USING btree ("person_id");--> statement-breakpoint
CREATE TRIGGER access_grant_audit AFTER INSERT OR UPDATE OR DELETE ON access_grant
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint
-- §11.200: every new signature must record how the signer re-authenticated.
-- NOT VALID exempts pre-existing rows: they are immutable (trigger-enforced),
-- and their nulls state the honest truth that no re-auth ceremony happened.
ALTER TABLE "signature" ADD CONSTRAINT "signature_reauth_required"
  CHECK ("reauth_method" IS NOT NULL AND "reauth_at" IS NOT NULL) NOT VALID;