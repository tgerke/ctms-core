import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { appDatabaseUrl } from "./env.js";

/**
 * Least-privilege runtime role (migration 0004): the API connects as
 * ctms_app, which can do DML but cannot TRUNCATE, run DDL, disable triggers,
 * or write audit_event directly — the audit trail is reachable only through
 * the SECURITY DEFINER trigger.
 */

const { sql } = createDb(appDatabaseUrl());
afterAll(() => sql.end());

const ROLLBACK = new Error("rollback");
async function inRollback(fn: (tx: typeof sql) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await fn(tx as unknown as typeof sql);
      throw ROLLBACK;
    })
    .catch((e) => {
      if (e !== ROLLBACK) throw e;
    });
}

describe("least-privilege runtime role (§11.10(c) §11.10(d))", () => {
  it("cannot TRUNCATE domain tables", async () => {
    await expect(sql`TRUNCATE person CASCADE`).rejects.toThrow(/permission denied/);
    await expect(sql`TRUNCATE audit_event`).rejects.toThrow(/permission denied/);
  });

  it("cannot disable triggers (not the table owner)", async () => {
    await expect(
      sql`ALTER TABLE audit_event DISABLE TRIGGER audit_event_immutable`,
    ).rejects.toThrow(/must be owner/);
  });

  it("cannot run DDL in the schema", async () => {
    await expect(sql`CREATE TABLE ctms_app_probe (id int)`).rejects.toThrow(
      /permission denied/,
    );
    await expect(sql`DROP TABLE person`).rejects.toThrow(/must be owner/);
  });

  it("cannot write audit_event directly, yet its DML is still audited", async () => {
    await expect(sql`
      INSERT INTO audit_event (occurred_at, actor_label, action, entity_type, prev_hash, hash)
      VALUES (now(), 'forger', 'fake.insert', 'organization', repeat('0', 64), repeat('0', 64))
    `).rejects.toThrow(/permission denied/);

    // The SECURITY DEFINER trigger still writes the trail for ordinary DML.
    await inRollback(async (tx) => {
      await tx`SELECT set_config('ctms.actor_label', 'ctms_app vitest', true)`;
      await tx`INSERT INTO organization (name, kind) VALUES ('App Role Probe', 'cro')`;
      const [event] = await tx`SELECT * FROM audit_event ORDER BY id DESC LIMIT 1`;
      expect(event!.action).toBe("organization.insert");
      expect(event!.actor_label).toBe("ctms_app vitest");
    });
  });

  it("keeps immutability guarantees (UPDATE/DELETE rejected by trigger)", async () => {
    await expect(sql`UPDATE signature SET meaning = 'author'`).rejects.toThrow(/immutable/);
    await expect(sql`DELETE FROM document_version`).rejects.toThrow(/immutable/);
  });
});
