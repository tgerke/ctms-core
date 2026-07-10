import { createDb } from "@ctms/db";
import { afterAll, describe, expect, it } from "vitest";
import { sha256Hex, signDocumentVersion, uploadDocument } from "./documents.js";

const { sql, db } = createDb();
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

async function studyId(): Promise<string> {
  const [row] = await sql`SELECT id FROM study LIMIT 1`;
  return row!.id;
}

describe("requirement engine", () => {
  it("materializes site- and person-scoped placeholders when scope appears", async () => {
    await inRollback(async (tx) => {
      const sid = await studyId();
      const [org] = await tx`
        INSERT INTO organization (name, kind)
        VALUES ('Engine Probe Org', 'site_org') RETURNING id`;
      const [site] = await tx`
        INSERT INTO site (organization_id, name) VALUES (${org!.id}, 'Probe Site')
        RETURNING id`;
      const [ss] = await tx`
        INSERT INTO study_site (study_id, site_id, site_number, status)
        VALUES (${sid}, ${site!.id}, '099', 'active') RETURNING id`;

      await tx`SELECT ctms_sync_expected_documents(${sid})`;
      const [siteExpected] = await tx`
        SELECT count(*)::int AS n FROM expected_document WHERE study_site_id = ${ss!.id}`;
      const [siteRules] = await tx`
        SELECT count(*)::int AS n FROM requirement_rule
        WHERE study_id = ${sid} AND scope_level = 'study_site'`;
      expect(siteExpected!.n).toBe(siteRules!.n); // no staff yet: site rules only

      // A PI joins: person-scoped placeholders appear (all-roles + PI-only)
      const [pi] = await tx`
        INSERT INTO person (given_name, family_name, email)
        VALUES ('Probe', 'Investigator', 'probe.pi@probe.example') RETURNING id`;
      await tx`
        INSERT INTO study_site_role (study_site_id, person_id, role, start_date)
        VALUES (${ss!.id}, ${pi!.id}, 'principal_investigator', CURRENT_DATE)`;
      await tx`SELECT ctms_sync_expected_documents(${sid})`;
      const personRows = await tx`
        SELECT v.artifact_code, v.status FROM v_expected_document_status v
        WHERE v.person_id = ${pi!.id}`;
      // CV, medical license, GCP, financial disclosure — all missing
      expect(personRows).toHaveLength(4);
      expect(personRows.every((r) => r.status === "missing")).toBe(true);

      // The PI leaves: unfulfilled placeholders are cleaned up
      await tx`UPDATE study_site_role
        SET end_date = CURRENT_DATE - 1 WHERE person_id = ${pi!.id}`;
      await tx`SELECT ctms_sync_expected_documents(${sid})`;
      const [after] = await tx`
        SELECT count(*)::int AS n FROM expected_document WHERE person_id = ${pi!.id}`;
      expect(after!.n).toBe(0);
    });
  });

  it("is idempotent", async () => {
    const sid = await studyId();
    const [before] = await sql`SELECT count(*)::int AS n FROM expected_document`;
    const [sync] = await sql`
      SELECT ctms_sync_expected_documents(${sid}) AS synced`;
    const [after] = await sql`SELECT count(*)::int AS n FROM expected_document`;
    expect(sync!.synced).toBe(0);
    expect(after!.n).toBe(before!.n);
  });
});

describe("derived status (ADR-0004)", () => {
  it("derives expired and expiring_soon from effective_date + validity", async () => {
    await inRollback(async (tx) => {
      const sid = await studyId();
      // IRB rule: 12-month validity. A 13-month-old approval must read expired.
      const [ss] = await tx`
        SELECT id FROM study_site WHERE site_number = '004'`;
      const [artifact] = await tx`
        SELECT id FROM tmf_artifact WHERE code = '04.01.02'`;
      await tx`UPDATE document SET status = 'superseded'
        WHERE study_site_id = ${ss!.id} AND tmf_artifact_id = ${artifact!.id}`;
      await tx`
        INSERT INTO document (tmf_artifact_id, study_id, study_site_id, title, status, effective_date)
        VALUES (${artifact!.id}, ${sid}, ${ss!.id}, 'Old IRB Approval', 'effective',
                (CURRENT_DATE - INTERVAL '13 months')::date)`;
      const [row] = await tx`
        SELECT status, effective_expiry FROM v_expected_document_status
        WHERE study_site_id = ${ss!.id} AND artifact_code = '04.01.02'`;
      expect(row!.status).toBe("expired");

      // Refresh it to 11 months old: expiring_soon (inside the 60-day window)
      await tx`UPDATE document SET effective_date = (CURRENT_DATE - INTERVAL '11 months')::date
        WHERE title = 'Old IRB Approval'`;
      const [row2] = await tx`
        SELECT status FROM v_expected_document_status
        WHERE study_site_id = ${ss!.id} AND artifact_code = '04.01.02'`;
      expect(row2!.status).toBe("expiring_soon");
    });
  });
});

describe("upload -> sign lifecycle", () => {
  it("lands pending, becomes effective on approval, binds signature to hash (§11.50 §11.70)", async () => {
    const sid = await studyId();
    const [ss] = await sql`SELECT id FROM study_site WHERE site_number = '001'`;
    // 05.03.02 Site Signature Sheet: no requirement rule references it, so the
    // demo dashboard is unaffected by repeated test runs.
    const [artifact] = await sql`SELECT id FROM tmf_artifact WHERE code = '05.03.02'`;
    const [signer] = await sql`
      SELECT id FROM person WHERE email = 'nora.feld@corc.example'`;
    const actor = { personId: signer!.id as string, label: "vitest" };

    const bytes = new TextEncoder().encode(`probe file ${Date.now()}`);
    const uploaded = await uploadDocument(db, actor, {
      tmfArtifactId: artifact!.id,
      studyId: sid,
      studySiteId: ss!.id,
      title: "Signature Sheet Probe",
      fileName: "probe.pdf",
      mimeType: "application/pdf",
      bytes,
    });
    expect(uploaded.sha256).toBe(sha256Hex(bytes));

    const [docBefore] = await sql`
      SELECT status FROM document WHERE id = ${uploaded.document.id}`;
    expect(docBefore!.status).toBe("pending_review");

    const sig = await signDocumentVersion(db, actor, {
      documentVersionId: uploaded.version.id,
      signerPersonId: actor.personId,
      meaning: "approval",
      reauthMethod: "dev_token",
      reauthAt: new Date(),
    });
    expect(sig.signedSha256).toBe(uploaded.sha256); // §11.70 binding

    const [docAfter] = await sql`
      SELECT status, effective_date FROM document WHERE id = ${uploaded.document.id}`;
    expect(docAfter!.status).toBe("effective");
    expect(docAfter!.effective_date).toBeTruthy();

    // Both operations are on the audit trail, attributed to the actor
    const events = await sql`
      SELECT action, actor_label FROM audit_event
      WHERE (entity_type = 'document_version' AND entity_id = ${uploaded.version.id})
         OR (entity_type = 'signature' AND entity_id = ${sig.id})`;
    expect(events.map((e) => e.action).sort()).toEqual([
      "document_version.insert",
      "signature.insert",
    ]);
    expect(events.every((e) => e.actor_label === "vitest")).toBe(true);

    // And the chain still verifies end to end
    const problems = await sql`SELECT * FROM ctms_verify_audit_chain()`;
    expect(problems).toHaveLength(0);
  });
});
