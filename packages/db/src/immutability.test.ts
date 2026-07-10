import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";

const { sql } = createDb();
afterAll(() => sql.end());

const ROLLBACK = new Error("rollback");
/** Run mutations in a transaction that always rolls back. */
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

describe("append-only enforcement (Part 11 §11.10(c)/(e))", () => {
  it("rejects UPDATE on audit_event at the database level", async () => {
    await expect(
      sql`UPDATE audit_event SET actor_label = 'tampered' WHERE id = 1`,
    ).rejects.toThrow(/immutable/);
  });

  it("rejects DELETE on audit_event", async () => {
    await expect(sql`DELETE FROM audit_event WHERE id = 1`).rejects.toThrow(
      /immutable/,
    );
  });

  it("rejects UPDATE and DELETE on document_version", async () => {
    await expect(
      sql`UPDATE document_version SET file_name = 'renamed.pdf'`,
    ).rejects.toThrow(/immutable/);
    await expect(sql`DELETE FROM document_version`).rejects.toThrow(/immutable/);
  });

  it("rejects UPDATE and DELETE on signature", async () => {
    await expect(sql`UPDATE signature SET meaning = 'author'`).rejects.toThrow(
      /immutable/,
    );
    await expect(sql`DELETE FROM signature`).rejects.toThrow(/immutable/);
  });
});

describe("audit trail", () => {
  it("writes an attributed, chained event for every domain mutation", async () => {
    await inRollback(async (tx) => {
      await tx`SELECT set_config('ctms.actor_label', 'vitest', true)`;
      await tx`INSERT INTO organization (name, kind) VALUES ('Audit Probe Org', 'cro')`;
      const [event] = await tx`
        SELECT * FROM audit_event ORDER BY id DESC LIMIT 1`;
      expect(event!.action).toBe("organization.insert");
      expect(event!.actor_label).toBe("vitest");
      expect(event!.after.name).toBe("Audit Probe Org");
      expect(event!.hash).toMatch(/^[0-9a-f]{64}$/);
      const [prev] = await tx`
        SELECT hash FROM audit_event WHERE id = ${event!.id - 1}`;
      expect(event!.prev_hash).toBe(prev!.hash);
    });
  });

  it("verifies clean on untampered data", async () => {
    const problems = await sql`SELECT * FROM ctms_verify_audit_chain()`;
    expect(problems).toHaveLength(0);
  });

  it("detects tampering when a row is altered with triggers disabled", async () => {
    await inRollback(async (tx) => {
      await tx`ALTER TABLE audit_event DISABLE TRIGGER audit_event_immutable`;
      await tx`UPDATE audit_event SET actor_label = 'evil' WHERE id = 2`;
      const problems = await tx`SELECT * FROM ctms_verify_audit_chain()`;
      expect(problems.length).toBeGreaterThan(0);
      expect(problems[0]!.problem).toMatch(/hash does not match/);
    });
    // rollback restored reality
    const clean = await sql`SELECT * FROM ctms_verify_audit_chain()`;
    expect(clean).toHaveLength(0);
  });
});
