-- eTMF-EMS serialization (ADR-0024): the three facts exchange.xml needs that
-- the schema did not carry. All three arrive via tooling (verbatim importer,
-- seed), never from model memory — the EMS export fails loudly when absent.

-- TMF RM "Unique ID Number" (spreadsheet column 13), the EMS <UNIQUEID>.
-- NULL for the seeded illustrative subset (ADR-0005); the verbatim importer
-- fills it. Unique in the model, so a duplicate is an import error.
ALTER TABLE "tmf_artifact" ADD COLUMN "unique_id" integer;--> statement-breakpoint
ALTER TABLE "tmf_artifact" ADD CONSTRAINT "tmf_artifact_unique_id_unique" UNIQUE("unique_id");--> statement-breakpoint

-- ISO 3166-1 alpha-3, the EMS <COUNTRYID> for site-level objects.
ALTER TABLE "site" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_country_alpha3"
  CHECK ("country" IS NULL OR "country" ~ '^[A-Z]{3}$');--> statement-breakpoint

-- Deployment-level reference facts; first key is 'tmf_rm_version', recorded
-- by the importer from the spreadsheet it loaded (the EMS TMFRMVERSION).
CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TRIGGER app_meta_audit AFTER INSERT OR UPDATE OR DELETE ON app_meta
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint

-- The analyst role reads the new table like everything else (0008 pattern).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ctms_readonly') THEN
    GRANT SELECT ON app_meta TO ctms_readonly;
  END IF;
END $$;
