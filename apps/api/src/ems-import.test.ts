import { createHash } from "node:crypto";
import {
  executeEmsImport,
  parseExchangeXml,
  planEmsImport,
  sriSha256,
  type ImportContext,
} from "@ctms/core";
import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * eTMF-EMS import against the live filing surface (ADR-0025): a partner batch
 * is planned from API reads and executed through the same audited multipart
 * endpoint every source system uses (ADR-0011), as the seeded ingest machine
 * identity. Fixture values follow the house convention: the 99.99.99 artifact
 * with unique ID 999999, per-run source-system names, per-run bytes.
 */

const { db, sql } = createDb();
let app: ReturnType<typeof buildApp>;
let studyId: string;
let siteNumber: string;
let fixtureArtifactId: number;

const RUN = `${Date.now()}`;
const SOURCE = `partner-etmf-${RUN}`;
const ADMIN = { Authorization: "Bearer dev-admin-token" };
const SERVICE = { Authorization: "Bearer dev-service-token" };

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const hashesOf = (bytes: Uint8Array) => ({
  sha256: sha256(bytes),
  sha384: createHash("sha384").update(bytes).digest("hex"),
  sha512: createHash("sha512").update(bytes).digest("hex"),
});
const bytesOf = (label: string) => new TextEncoder().encode(`${label} ${RUN}`);

beforeAll(async () => {
  process.env.AUTH_MODE = "dev";
  app = buildApp(db, sql);
  const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
  studyId = study!.id;

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
  // The EMS mapping key (ADR-0024): fixture value, deterministic across runs.
  await sql`UPDATE tmf_artifact SET unique_id = 999999 WHERE id = ${fixtureArtifactId}`;
  // Older fixture sites may predate the country column (ems.test.ts pattern).
  await sql`UPDATE site SET country = 'USA' WHERE country IS NULL`;
  const [site] = await sql`
    SELECT site_number FROM study_site WHERE study_id = ${studyId} ORDER BY site_number LIMIT 1`;
  siteNumber = site!.site_number;
});
afterAll(() => sql.end());

/** A partner package: one trial-level object in two iterations, one site-level. */
function partnerPackage() {
  const files = new Map<string, Uint8Array>([
    ["files/plan-v1.pdf", bytesOf("plan v1")],
    ["files/plan-v2.pdf", bytesOf("plan v2")],
    ["files/site-doc.pdf", bytesOf("site doc")],
  ]);
  const integrity = (url: string) => sriSha256(sha256(files.get(url)!));
  const object = (body: string) => `  <OBJECT>\n${body}\n  </OBJECT>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<BATCH xmlns="https://tmfrefmodel.com/ems" STUDYID="CORC-2201" TRANSFERSOURCEID="${SOURCE}"
       TRANSFERID="20260712120000" SPECIFICATIONID="EA-TEST" TMFRMVERSION="3.3.1">
${object(`    <OBJECTID>obj-plan-${RUN}</OBJECTID>
    <OBJECTLEVEL>Trial</OBJECTLEVEL>
    <UNIQUEID>999999</UNIQUEID>
    <ARTIFACTNUMBER>99.99.99</ARTIFACTNUMBER>
    <OBJECTVERSION>1</OBJECTVERSION>
    <OBJECTVERSIONSTATE>Superseded</OBJECTVERSIONSTATE>
    <OBJECTTITLE>Partner plan (EMS import fixture)</OBJECTTITLE>
    <OBJECTCOPY>No</OBJECTCOPY>
    <FILE>
      <INTEGRITY>${integrity("files/plan-v1.pdf")}</INTEGRITY>
      <FILENAME>plan-v1.pdf</FILENAME>
      <CONTENTURL>files/plan-v1.pdf</CONTENTURL>
    </FILE>`)}
${object(`    <OBJECTID>obj-plan-${RUN}</OBJECTID>
    <OBJECTLEVEL>Trial</OBJECTLEVEL>
    <UNIQUEID>999999</UNIQUEID>
    <ARTIFACTNUMBER>99.99.99</ARTIFACTNUMBER>
    <OBJECTVERSION>2</OBJECTVERSION>
    <OBJECTVERSIONSTATE>Current</OBJECTVERSIONSTATE>
    <OBJECTTITLE>Partner plan (EMS import fixture)</OBJECTTITLE>
    <OBJECTCOPY>No</OBJECTCOPY>
    <FILE>
      <INTEGRITY>${integrity("files/plan-v2.pdf")}</INTEGRITY>
      <FILENAME>plan-v2.pdf</FILENAME>
      <CONTENTURL>files/plan-v2.pdf</CONTENTURL>
    </FILE>`)}
${object(`    <OBJECTID>obj-site-${RUN}</OBJECTID>
    <OBJECTLEVEL>Site</OBJECTLEVEL>
    <COUNTRYID>USA</COUNTRYID>
    <SITESYSTEMID>partner-site-1</SITESYSTEMID>
    <SITEID>${siteNumber}</SITEID>
    <UNIQUEID>999999</UNIQUEID>
    <ARTIFACTNUMBER>99.99.99</ARTIFACTNUMBER>
    <OBJECTVERSION>1</OBJECTVERSION>
    <OBJECTVERSIONSTATE>Current</OBJECTVERSIONSTATE>
    <OBJECTTITLE>Partner site document (EMS import fixture)</OBJECTTITLE>
    <OBJECTCOPY>No</OBJECTCOPY>
    <FILE>
      <INTEGRITY>${integrity("files/site-doc.pdf")}</INTEGRITY>
      <FILENAME>site-doc.pdf</FILENAME>
      <CONTENTURL>files/site-doc.pdf</CONTENTURL>
    </FILE>`)}
</BATCH>
`;
  return { xml, files };
}

/** Build the import context the way the CLI does: from API reads. */
async function contextFromApi(files: Map<string, Uint8Array>): Promise<ImportContext> {
  const studies = (await (await app.request("/studies", { headers: SERVICE })).json()) as {
    id: string;
    protocol_number: string;
  }[];
  const study = studies.find((s) => s.protocol_number === "CORC-2201")!;

  const artifacts = (await (
    await app.request("/tmf-artifacts", { headers: SERVICE })
  ).json()) as { id: number; code: string; name: string; unique_id: number | null }[];
  const artifactsByUniqueId = new Map(
    artifacts
      .filter((a) => a.unique_id !== null)
      .map((a) => [a.unique_id!, { id: a.id, code: a.code, name: a.name }]),
  );

  const sites = (await (
    await app.request(`/studies/${study.id}/sites`, { headers: SERVICE })
  ).json()) as { study_site_id: string; site_number: string; country: string | null }[];
  const sitesBySiteNumber = new Map(
    sites.map((s) => [
      s.site_number,
      { study_site_id: s.study_site_id, site_country: s.country },
    ]),
  );

  const filings = (await (
    await app.request(
      `/studies/${study.id}/filings?source_system=${encodeURIComponent(SOURCE)}`,
      { headers: SERVICE },
    )
  ).json()) as {
    document_id: string;
    document_status: string;
    source_ref: string | null;
    sha256: string;
  }[];
  const existingFilings = new Map(
    filings
      .filter((f) => f.source_ref !== null)
      .map((f) => [
        f.source_ref!,
        { document_id: f.document_id, sha256: f.sha256, document_status: f.document_status },
      ]),
  );

  const fileHashes = new Map([...files].map(([url, bytes]) => [url, hashesOf(bytes)]));
  return { study, artifactsByUniqueId, sitesBySiteNumber, existingFilings, fileHashes };
}

describe("EMS import surface (ADR-0025)", () => {
  it("GET /tmf-artifacts carries the TMF RM unique ID, the EMS mapping key", async () => {
    const res = await app.request("/tmf-artifacts", { headers: SERVICE });
    expect(res.status).toBe(200);
    const artifacts = (await res.json()) as { code: string; unique_id: number | null }[];
    expect(artifacts.find((a) => a.code === "99.99.99")!.unique_id).toBe(999999);
  });

  it("GET /studies/{id}/filings starts empty for a source system that never filed", async () => {
    const res = await app.request(
      `/studies/${studyId}/filings?source_system=${encodeURIComponent(SOURCE)}`,
      { headers: SERVICE },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("imports a partner batch through the filing endpoint as the ingest identity, idempotently", async () => {
    const { xml, files } = partnerPackage();
    const batch = parseExchangeXml(xml);
    const plan = planEmsImport(batch, await contextFromApi(files));
    expect(plan.actions).toHaveLength(3);

    const result = await executeEmsImport(
      plan,
      (url) => files.get(url)!,
      async (path, init) => app.request(path, { ...init, headers: SERVICE }),
    );
    // two partner objects → two documents; the second iteration threads on
    expect(result.documentsCreated).toBe(2);
    expect(result.versionsAdded).toBe(1);

    // both iterations of the plan object landed on one document, in order,
    // pending review, with the partner's provenance on each version
    const planDoc = result.filed.find((f) => f.sourceRef === `obj-plan-${RUN}:1`)!;
    const threaded = result.filed.find((f) => f.sourceRef === `obj-plan-${RUN}:2`)!;
    expect(threaded.documentId).toBe(planDoc.documentId);
    const detail = (await (
      await app.request(`/documents/${planDoc.documentId}`, { headers: ADMIN })
    ).json()) as {
      document: { status: string };
      versions: { version_number: number; source_system: string; source_ref: string }[];
    };
    expect(detail.document.status).toBe("pending_review");
    expect(detail.versions).toHaveLength(2);
    expect(detail.versions.map((v) => v.source_system)).toEqual([SOURCE, SOURCE]);
    expect(detail.versions.map((v) => v.source_ref).sort()).toEqual([
      `obj-plan-${RUN}:1`,
      `obj-plan-${RUN}:2`,
    ]);

    // the filings endpoint now accounts for all three versions…
    const filings = (await (
      await app.request(
        `/studies/${studyId}/filings?source_system=${encodeURIComponent(SOURCE)}`,
        { headers: SERVICE },
      )
    ).json()) as { source_ref: string }[];
    expect(filings).toHaveLength(3);

    // …so re-running the same batch plans nothing: idempotent by provenance
    const replan = planEmsImport(batch, await contextFromApi(files));
    expect(replan.actions).toHaveLength(0);
    expect(replan.skipped.sort()).toEqual([
      `obj-plan-${RUN}:1`,
      `obj-plan-${RUN}:2`,
      `obj-site-${RUN}:1`,
    ]);
  });

  it("POST /documents/{id}/versions appends to exactly that document", async () => {
    const form = new FormData();
    form.set("file", new File([bytesOf("direct v1")], "direct.pdf", { type: "application/pdf" }));
    form.set("tmf_artifact_id", String(fixtureArtifactId));
    form.set("study_id", studyId);
    form.set("title", "Direct version-append fixture");
    form.set("force_new", "true");
    const created = (await (
      await app.request("/documents", { method: "POST", headers: ADMIN, body: form })
    ).json()) as { document_id: string };

    const v2 = new FormData();
    v2.set("file", new File([bytesOf("direct v2")], "direct-v2.pdf", { type: "application/pdf" }));
    v2.set("source_system", SOURCE);
    v2.set("source_ref", `direct-${RUN}:2`);
    const res = await app.request(`/documents/${created.document_id}/versions`, {
      method: "POST",
      headers: ADMIN,
      body: v2,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { document_id: string; version_number: number };
    expect(body.document_id).toBe(created.document_id);
    expect(body.version_number).toBe(2);
  });

  it("refuses to grow a superseded document — closed history stays closed", async () => {
    const upload = async (label: string) => {
      const form = new FormData();
      form.set("file", new File([bytesOf(label)], `${label.replaceAll(" ", "-")}.pdf`, {
        type: "application/pdf",
      }));
      form.set("tmf_artifact_id", String(fixtureArtifactId));
      form.set("study_id", studyId);
      form.set("title", `Supersede fixture ${label}`);
      form.set("force_new", "true");
      const res = await app.request("/documents", { method: "POST", headers: ADMIN, body: form });
      expect(res.status).toBe(201);
      return (await res.json()) as { document_id: string; version_id: string };
    };
    const approve = async (versionId: string) => {
      const res = await app.request(`/document-versions/${versionId}/sign`, {
        method: "POST",
        headers: { ...ADMIN, "Content-Type": "application/json" },
        body: JSON.stringify({ meaning: "approval", reauth_token: "dev-admin-token" }),
      });
      expect(res.status).toBe(201);
    };

    const older = await upload(`supersede a ${RUN}`);
    await approve(older.version_id);
    const newer = await upload(`supersede b ${RUN}`);
    await approve(newer.version_id); // supersedes the older sibling

    const form = new FormData();
    form.set("file", new File([bytesOf("late arrival")], "late.pdf", { type: "application/pdf" }));
    const res = await app.request(`/documents/${older.document_id}/versions`, {
      method: "POST",
      headers: ADMIN,
      body: form,
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/superseded/);
  });
});
