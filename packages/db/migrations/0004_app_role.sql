-- Least-privilege runtime role for the API (compliance doc, honest gap #3).
-- ctms_app holds DML only: no TRUNCATE, no DDL (no CREATE on the schema), and
-- no trigger disablement (requires table ownership, which stays with the
-- migration role). Dev-grade password, same pattern as ctms_readonly; a
-- production deployment rotates it with ALTER ROLE.
DO $$ BEGIN
  CREATE ROLE ctms_app LOGIN PASSWORD 'ctms_app';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO ctms_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ctms_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ctms_app;--> statement-breakpoint
-- Tables and sequences added by future migrations (run by the owning role)
-- inherit the same DML-only grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ctms_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ctms_app;--> statement-breakpoint
-- The audit trail is written only by the trigger, never by the role: with
-- SECURITY DEFINER the trigger function inserts as the table owner, and the
-- runtime role loses direct INSERT — it cannot fabricate audit events even
-- with a correctly recomputed hash chain.
ALTER FUNCTION ctms_audit() SECURITY DEFINER;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_event FROM ctms_app;