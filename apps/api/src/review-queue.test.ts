import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * Review assignments and the queue (ADR-0018), exercised through the HTTP
 * surface. Fixtures use the test-only 99.99.99 artifact scoped to a study
 * site, like return.test.ts; assignments are ordinary audited rows and the
 * queue is derived, so approving/returning fixtures is the cleanup.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;
let studySiteId: string;
let fixtureArtifactId: number;
let feldId: string;
let patelId: string;

const ADMIN = { Authorization: "Bearer dev-admin-token" };
const MONITOR = { Authorization: "Bearer dev-monitor-token" };

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
  studyId = study!.id;
  const [site] = await sql`
    SELECT id FROM study_site WHERE study_id = ${studyId} ORDER BY site_number LIMIT 1`;
  studySiteId = site!.id;
  const [feld] = await sql`SELECT id FROM person WHERE email = 'nora.feld@corc.example'`;
  feldId = feld!.id;
  const [patel] = await sql`SELECT id FROM person WHERE email = 'ravi.patel@meridiancro.example'`;
  patelId = patel!.id;

  await sql`SELECT set_config('ctms.actor_label', 'vitest', false)`;
  const [zone] = await sql`
    INSERT INTO tmf_zone (number, name) VALUES (99, 'Test Fixtures')
    ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const [section] = await sql`
    INSERT INTO tmf_section (zone_id, code, name) VALUES (${zone!.id}, '99.99', 'Test')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const [artifact] = await sql`
    INSERT INTO tmf_artifact (section_id, code, name)
    VALUES (${section!.id}, '99.99.99', 'API Test Fixture')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  fixtureArtifactId = artifact!.id;
});
afterAll(() => sql.end());

async function uploadFixture(): Promise<{ document_id: string; version_id: string }> {
  const form = new FormData();
  form.set(
    "file",
    new File([`queue fixture ${Date.now()}-${Math.random()}`], "fixture.pdf", {
      type: "application/pdf",
    }),
  );
  form.set("tmf_artifact_id", String(fixtureArtifactId));
  form.set("study_id", studyId);
  form.set("study_site_id", studySiteId);
  form.set("title", "Review queue fixture");
  const res = await app.request("/documents", { method: "POST", headers: ADMIN, body: form });
  expect(res.status).toBe(201);
  return (await res.json()) as { document_id: string; version_id: string };
}

const assign = (
  versionId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = ADMIN,
) =>
  app.request(`/document-versions/${versionId}/assign-review`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const queue = async (params = "") => {
  const res = await app.request(`/studies/${studyId}/review-queue${params}`, {
    headers: ADMIN,
  });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    document_version_id: string;
    queue_status: string;
    assigned_to: string | null;
    assignee_family_name: string | null;
    due_date: string | null;
  }[];
};

describe("review queue (ADR-0018)", () => {
  it("an unassigned pending version sits in the queue as 'unassigned'", async () => {
    const { version_id } = await uploadFixture();
    const entry = (await queue()).find((e) => e.document_version_id === version_id);
    expect(entry).toBeDefined();
    expect(entry!.queue_status).toBe("unassigned");
  });

  it("assigning with a past due date derives 'overdue'; filters find it", async () => {
    const { version_id } = await uploadFixture();
    const res = await assign(version_id, {
      assignee_person_id: feldId,
      due_date: "2026-07-01",
    });
    expect(res.status).toBe(201);
    const entry = (await queue(`?assigned_to=${feldId}&status=overdue`)).find(
      (e) => e.document_version_id === version_id,
    );
    expect(entry).toBeDefined();
    expect(entry!.assignee_family_name).toBe("Feld");
  });

  it("reassignment inserts a new row and the latest one stands", async () => {
    const { version_id } = await uploadFixture();
    expect(
      (await assign(version_id, { assignee_person_id: feldId, due_date: "2026-07-01" })).status,
    ).toBe(201);
    expect((await assign(version_id, { assignee_person_id: feldId })).status).toBe(201);
    const entry = (await queue()).find((e) => e.document_version_id === version_id);
    expect(entry!.queue_status).toBe("assigned"); // no due date on the latest row
    expect(entry!.due_date).toBeNull();
  });

  it("the assignee must be able to approve: a monitor-role assignee is refused", async () => {
    const { version_id } = await uploadFixture();
    const res = await assign(version_id, { assignee_person_id: patelId });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("cannot approve");
  });

  it("assigning takes 'approve' authority: the monitor token gets 403", async () => {
    const { version_id } = await uploadFixture();
    const res = await assign(version_id, { assignee_person_id: feldId }, MONITOR);
    expect(res.status).toBe(403);
  });

  it("approval clears the entry from the queue — the assignment resolves itself", async () => {
    const { version_id } = await uploadFixture();
    expect((await assign(version_id, { assignee_person_id: feldId })).status).toBe(201);
    const approve = await app.request(`/document-versions/${version_id}/sign`, {
      method: "POST",
      headers: { ...ADMIN, "Content-Type": "application/json" },
      body: JSON.stringify({ meaning: "approval", reauth_token: "dev-admin-token" }),
    });
    expect(approve.status).toBe(201);
    expect((await queue()).find((e) => e.document_version_id === version_id)).toBeUndefined();
  });

  it("a return clears the entry too, and the returned version cannot be assigned", async () => {
    const { version_id } = await uploadFixture();
    const ret = await app.request(`/document-versions/${version_id}/return`, {
      method: "POST",
      headers: { ...ADMIN, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Wrong file." }),
    });
    expect(ret.status).toBe(201);
    expect((await queue()).find((e) => e.document_version_id === version_id)).toBeUndefined();
    const res = await assign(version_id, { assignee_person_id: feldId });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("pending_review");
  });

  it("assignments land on the document detail and in the audit trail", async () => {
    const { document_id, version_id } = await uploadFixture();
    expect(
      (await assign(version_id, { assignee_person_id: feldId, note: "please QC" })).status,
    ).toBe(201);
    const detail = await app.request(`/documents/${document_id}`, { headers: ADMIN });
    // Fixture uploads share one document lineage, so earlier tests' assignments
    // are on it too — assert ours is present, newest first.
    const body = (await detail.json()) as { assignments: { note: string | null }[] };
    expect(body.assignments.length).toBeGreaterThan(0);
    expect(body.assignments[0]!.note).toBe("please QC");

    const audit = await app.request(`/audit-events?entity_type=review_assignment`, {
      headers: ADMIN,
    });
    const events = (await audit.json()) as { action: string }[];
    expect(events.some((e) => e.action === "review_assignment.insert")).toBe(true);
  });
});
