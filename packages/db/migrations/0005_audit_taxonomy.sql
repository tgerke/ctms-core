-- The TMF taxonomy was reference data seeded once; with the importer
-- (pnpm db:import-tmf) it is mutable at runtime, so it gets the same
-- trigger-written audit as every other domain table. Surfaced by the IQ
-- check "audit trigger on every domain table".
CREATE TRIGGER tmf_zone_audit AFTER INSERT OR UPDATE OR DELETE ON tmf_zone
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint
CREATE TRIGGER tmf_section_audit AFTER INSERT OR UPDATE OR DELETE ON tmf_section
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();--> statement-breakpoint
CREATE TRIGGER tmf_artifact_audit AFTER INSERT OR UPDATE OR DELETE ON tmf_artifact
  FOR EACH ROW EXECUTE FUNCTION ctms_audit();
