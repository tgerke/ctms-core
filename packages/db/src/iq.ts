/**
 * Installation Qualification (IQ): one command that checks a live environment
 * against the installed controls the compliance mapping claims — migrations,
 * triggers, role privileges, the audit hash chain, and storage posture — and
 * prints a signed-off-able report. Exit code 1 on any FAIL.
 *
 * Usage: pnpm validation:iq [--report path.md]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb } from "./client.js";

type Level = "PASS" | "FAIL" | "WARN";
const results: { level: Level; check: string; detail: string }[] = [];
const record = (level: Level, check: string, detail: string) =>
  results.push({ level, check, detail });
const ok = (cond: boolean, check: string, detail: string) =>
  record(cond ? "PASS" : "FAIL", check, detail);

// expected_document (ADR-0004) and document_content_text (ADR-0022) are
// derived state, deliberately unaudited; audit_event cannot audit itself.
const AUDIT_EXEMPT = new Set(["expected_document", "document_content_text", "audit_event"]);

async function main() {
  const { sql } = createDb();

  // migrations applied = journal entries
  const journalPath = fileURLToPath(new URL("../migrations/meta/_journal.json", import.meta.url));
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: unknown[] };
  const [migrations] = await sql`
    SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  ok(
    migrations!.n === journal.entries.length,
    "migrations applied",
    `${migrations!.n} applied, ${journal.entries.length} in journal`,
  );

  // immutability triggers (§11.10(c))
  for (const table of ["audit_event", "document_version", "signature"]) {
    const [trigger] = await sql`
      SELECT count(*)::int AS n FROM pg_trigger
      WHERE tgname = ${`${table}_immutable`} AND NOT tgisinternal`;
    ok(trigger!.n === 1, `immutability trigger on ${table}`, trigger!.n === 1 ? "present" : "MISSING");
  }

  // every domain table carries the audit trigger (§11.10(e))
  const unaudited = await sql`
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE t.tgrelid = c.oid AND p.proname = 'ctms_audit' AND NOT t.tgisinternal)
    ORDER BY c.relname`;
  const missing = unaudited.map((r) => r.relname as string).filter((t) => !AUDIT_EXEMPT.has(t));
  ok(
    missing.length === 0,
    "audit trigger on every domain table",
    missing.length ? `missing on: ${missing.join(", ")}` : `all audited (exempt by design: ${[...AUDIT_EXEMPT].join(", ")})`,
  );

  // audit writer runs as definer; runtime role cannot forge events
  const [prosecdef] = await sql`
    SELECT prosecdef FROM pg_proc WHERE proname = 'ctms_audit'`;
  ok(Boolean(prosecdef?.prosecdef), "ctms_audit() is SECURITY DEFINER", String(prosecdef?.prosecdef));

  // roles and privilege ceilings (§11.10(d))
  for (const role of ["ctms_app", "ctms_readonly"]) {
    const [row] = await sql`SELECT count(*)::int AS n FROM pg_roles WHERE rolname = ${role}`;
    ok(row!.n === 1, `role ${role} exists`, row!.n === 1 ? "present" : "MISSING");
  }
  const [privileges] = await sql`
    SELECT has_schema_privilege('ctms_app', 'public', 'CREATE') AS can_create,
           has_table_privilege('ctms_app', 'audit_event', 'INSERT') AS can_forge,
           has_table_privilege('ctms_app', 'person', 'TRUNCATE') AS can_truncate`;
  ok(!privileges!.can_create, "ctms_app cannot CREATE in schema", String(privileges!.can_create));
  ok(!privileges!.can_forge, "ctms_app cannot INSERT audit_event directly", String(privileges!.can_forge));
  ok(!privileges!.can_truncate, "ctms_app cannot TRUNCATE", String(privileges!.can_truncate));

  // §11.200 manifestation required for new signatures
  const [reauthCheck] = await sql`
    SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'signature_reauth_required'`;
  ok(reauthCheck!.n === 1, "signature re-auth CHECK constraint", reauthCheck!.n === 1 ? "present" : "MISSING");

  // audit hash chain verifies end to end (§11.10(e))
  const problems = await sql`SELECT * FROM ctms_verify_audit_chain()`;
  const [events] = await sql`SELECT count(*)::int AS n FROM audit_event`;
  ok(problems.length === 0, "audit hash chain verifies", `${events!.n} events, ${problems.length} problems`);

  // storage posture (§11.10(b)/(c) for the bytes)
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "s3") {
    const { GetObjectLockConfigurationCommand } = await import("@aws-sdk/client-s3");
    const { makeS3Store, s3ConfigFromEnv } = await import("./storage.js");
    const config = s3ConfigFromEnv();
    try {
      const lock = await makeS3Store(config).client.send(
        new GetObjectLockConfigurationCommand({ Bucket: config.bucket }),
      );
      ok(
        lock.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled",
        "S3 bucket Object Lock enabled (WORM)",
        lock.ObjectLockConfiguration?.ObjectLockEnabled ?? "not configured",
      );
    } catch (e) {
      record("FAIL", "S3 bucket Object Lock enabled (WORM)", e instanceof Error ? e.message : String(e));
    }
  } else {
    record("WARN", "storage driver", `'${driver}' — local directory store is dev-only, not WORM`);
  }

  // auth posture
  const mode = process.env.AUTH_MODE;
  if (mode === "oidc") record("PASS", "AUTH_MODE", "oidc");
  else record("WARN", "AUTH_MODE", `'${mode ?? "unset"}' — dev tokens are not a Part 11 access-control posture`);

  await sql.end();

  const lines = results.map((r) => `[${r.level}] ${r.check} — ${r.detail}`);
  console.log(lines.join("\n"));
  const failures = results.filter((r) => r.level === "FAIL").length;
  const warnings = results.filter((r) => r.level === "WARN").length;
  console.log(`\nIQ: ${results.length} checks, ${failures} failed, ${warnings} warnings`);

  const reportFlag = process.argv.indexOf("--report");
  if (reportFlag !== -1 && process.argv[reportFlag + 1]) {
    const path = process.argv[reportFlag + 1]!;
    writeFileSync(
      path,
      [
        "# Installation Qualification report",
        "",
        `Generated ${new Date().toISOString()} against \`${process.env.DATABASE_URL ?? "default DATABASE_URL"}\`.`,
        "",
        "| Result | Check | Detail |",
        "| --- | --- | --- |",
        ...results.map((r) => `| ${r.level} | ${r.check} | ${r.detail} |`),
        "",
        `**${failures === 0 ? "IQ PASSED" : "IQ FAILED"}** — ${results.length} checks, ${failures} failed, ${warnings} warnings.`,
        "",
        "Reviewed by: ______________________  Date: ____________",
        "",
      ].join("\n"),
    );
    console.log(`report written to ${path}`);
  }
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
