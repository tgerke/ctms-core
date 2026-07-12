import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@ctms/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildExchangeXml, EmsMappingError, sriSha256 } from "./ems.js";
import { collectTmfExport, type TmfExportData } from "./export.js";

/**
 * eTMF-EMS serialization (ADR-0024). Structure and allowed values follow the
 * v1.0.2 spec and XSD in the verified source library; the integration test
 * validates real seeded-study output against the vendored official schema.
 * Fixture values (unique IDs 900000+, TMF RM version 99.9) mirror the
 * 99.99.99 fixture convention: obviously outside the real model.
 */

const XSD = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../tools/ems/TmfReferenceModelExchange.xsd",
);
const hasXmllint = (() => {
  try {
    execFileSync("xmllint", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function syntheticData(overrides: Partial<TmfExportData> = {}): TmfExportData {
  return {
    study: { id: "study-uuid", protocol_number: "SYN-0001" },
    documents: [
      {
        id: "doc-1",
        title: "Monitoring Plan <v2> & appendix",
        status: "effective",
        effective_date: "2026-01-20",
        expires_at: "2027-01-20",
        artifact_code: "01.01.03",
        artifact_unique_id: 900003,
        study_site_id: null,
        site_number: null,
        site_name: null,
        site_country: null,
        person_given_name: null,
        person_family_name: null,
        versions: [
          {
            id: "ver-1",
            version_number: 1,
            sha256: EMPTY_SHA256,
            file_name: "monitoring-plan.pdf",
            mime_type: "application/pdf",
            uploaded_at: "2026-01-02T08:00:00+00:00",
            source_system: null,
            source_ref: null,
          },
          {
            id: "ver-2",
            version_number: 2,
            sha256: EMPTY_SHA256,
            file_name: "monitoring-plan-v2.pdf",
            mime_type: "application/pdf",
            uploaded_at: "2026-01-20T08:00:00+00:00",
            source_system: "edc-core",
            source_ref: "export/42",
          },
        ],
        signatures: [
          {
            version_number: 2,
            meaning: "approval",
            signer: "Dana Whitfield",
            signer_email: "dana@example.org",
            signed_at: "2026-01-20T14:00:25+00:00",
          },
        ],
        returns: [],
      },
    ],
    expected: [],
    auditEvents: [
      {
        id: 7,
        occurred_at: "2026-01-02T08:00:01+00:00",
        actor_label: "dana@example.org",
        action: "document_version.insert",
        entity_type: "document_version",
        entity_id: "ver-1",
        before: null,
        after: { id: "ver-1" },
      },
      {
        id: 9,
        occurred_at: "2026-01-20T14:00:26+00:00",
        actor_label: "dana@example.org",
        action: "signature.insert",
        entity_type: "signature",
        entity_id: "sig-1",
        before: null,
        after: { id: "sig-1", document_version_id: "ver-2" },
      },
    ],
    chain: { events: 2, valid: true, head_hash: "x" },
    blobs: [],
    tmfRmVersion: "99.9",
    ...overrides,
  };
}

const opts = { agreementId: "SYN-EA-001", generatedAt: new Date("2026-07-12T10:15:00Z") };

describe("exchange.xml serialization (ADR-0024)", () => {
  it("maps batch attributes, object order, and version state per spec/XSD", () => {
    const xml = buildExchangeXml(syntheticData(), opts);
    expect(xml).toContain('xmlns="https://tmfrefmodel.com/ems"');
    expect(xml).toContain('STUDYID="SYN-0001"');
    expect(xml).toContain('TRANSFERID="20260712101500"');
    expect(xml).toContain('SPECIFICATIONID="SYN-EA-001"');
    expect(xml).toContain('TMFRMVERSION="99.9"');

    // one OBJECT per document version, older iteration Superseded
    expect(xml.match(/<OBJECT>/g)).toHaveLength(2);
    const [v1, v2] = xml.split("<OBJECT>").slice(1);
    expect(v1).toContain("<OBJECTVERSION>1</OBJECTVERSION>");
    expect(v1).toContain("<OBJECTVERSIONSTATE>Superseded</OBJECTVERSIONSTATE>");
    expect(v2).toContain("<OBJECTVERSION>2</OBJECTVERSION>");
    expect(v2).toContain("<OBJECTVERSIONSTATE>Current</OBJECTVERSIONSTATE>");

    // XML escaping, spec date format, trial-level object
    expect(xml).toContain("Monitoring Plan &lt;v2&gt; &amp; appendix");
    expect(xml).toContain("<OBJECTEXPIRYDATE>20-JAN-2027</OBJECTEXPIRYDATE>");
    expect(xml).toContain("<ARTIFACTDATE>20-JAN-2026</ARTIFACTDATE>");
    expect(xml).toContain("<OBJECTLEVEL>Trial</OBJECTLEVEL>");
    expect(xml).not.toContain("<COUNTRYID>");

    // FILE: SRI integrity over the content-addressed name
    expect(xml).toContain(`<INTEGRITY>${sriSha256(EMPTY_SHA256)}</INTEGRITY>`);
    expect(xml).toContain(`<CONTENTURL>files/${EMPTY_SHA256}.pdf</CONTENTURL>`);

    // signature and audit records land on their version's FILE only
    expect(v1).not.toContain("<SIGNATURE>");
    expect(v2).toContain("<USEROID>dana@example.org</USEROID>");
    expect(v1).toContain("<AUDITID>7</AUDITID>");
    expect(v1).not.toContain("<AUDITID>9</AUDITID>");
    expect(v2).toContain("<AUDITID>9</AUDITID>");
    expect(v2).toContain("<AUDITENTRYTYPE>New</AUDITENTRYTYPE>");

    // agreement-defined metadata carries what standard tags cannot
    expect(v2).toContain('<METADATA NAME="CTMS_ORIGINAL_FILENAME">monitoring-plan-v2.pdf</METADATA>');
    expect(v2).toContain('<METADATA NAME="CTMS_SOURCE_SYSTEM">edc-core</METADATA>');
  });

  it("computes the SRI checksum the standard cites (sha256, base64)", () => {
    // Known answer: sha256 of the empty string.
    expect(sriSha256(EMPTY_SHA256)).toBe("sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  });

  it("marks the latest iteration of a returned document Obsolete", () => {
    const data = syntheticData();
    data.documents[0]!.status = "returned";
    const xml = buildExchangeXml(data, opts);
    const [v1, v2] = xml.split("<OBJECT>").slice(1);
    expect(v1).toContain("<OBJECTVERSIONSTATE>Superseded</OBJECTVERSIONSTATE>");
    expect(v2).toContain("<OBJECTVERSIONSTATE>Obsolete</OBJECTVERSIONSTATE>");
  });

  it("emits site-level identifiers for site-scoped documents", () => {
    const data = syntheticData();
    Object.assign(data.documents[0]!, {
      study_site_id: "ss-uuid",
      site_number: "001",
      site_name: "University Medical Center",
      site_country: "USA",
    });
    const xml = buildExchangeXml(data, opts);
    expect(xml).toContain("<OBJECTLEVEL>Site</OBJECTLEVEL>");
    expect(xml).toContain("<COUNTRYID>USA</COUNTRYID>");
    expect(xml).toContain("<SITESYSTEMID>ss-uuid</SITESYSTEMID>");
    expect(xml).toContain("<SITEID>001</SITEID>");
  });

  it("refuses to fabricate: every blocker reported at once, nothing emitted", () => {
    const data = syntheticData({ tmfRmVersion: null });
    data.documents[0]!.artifact_unique_id = null;
    Object.assign(data.documents[0]!, { study_site_id: "ss-uuid", site_name: "No-Country Site" });
    const err = (() => {
      try {
        buildExchangeXml(data, opts);
        return null;
      } catch (e) {
        return e as EmsMappingError;
      }
    })();
    expect(err).toBeInstanceOf(EmsMappingError);
    expect(err!.problems.join("\n")).toMatch(/tmf_rm_version/);
    expect(err!.problems.join("\n")).toMatch(/01\.01\.03/);
    expect(err!.problems.join("\n")).toMatch(/No-Country Site/);
  });

  it("refuses an empty batch (XSD requires at least one OBJECT)", () => {
    const data = syntheticData();
    (data.documents[0]! as { versions: unknown[] }).versions = [];
    expect(() => buildExchangeXml(data, opts)).toThrow(/cannot be empty/);
  });
});

describe("exchange.xml against the seeded study", () => {
  const { sql } = createDb();
  let studyId: string;

  beforeAll(async () => {
    const [study] = await sql`SELECT id FROM study WHERE protocol_number = 'CORC-2201'`;
    studyId = study!.id;
    // Fixture EMS facts, normally written by `pnpm db:import-tmf` (ADR-0024):
    // a fixture model version and fixture unique IDs (900000+) on exactly the
    // artifacts the study's documents reference. Values are deterministic so
    // re-runs are idempotent against the immutable-audit database.
    await sql`
      INSERT INTO app_meta (key, value, updated_at) VALUES ('tmf_rm_version', '99.9', now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
    await sql`
      UPDATE tmf_artifact ta SET unique_id = 900000 + ta.id
      WHERE ta.unique_id IS NULL AND EXISTS (
        SELECT 1 FROM document d WHERE d.tmf_artifact_id = ta.id AND d.study_id = ${studyId})`;
    // Suites before this change left fixture sites without a country, and
    // their uploaded versions are immutable — backfill instead of cleanup.
    // Seeded sites always carry one; NULL here can only be a test fixture.
    await sql`UPDATE site SET country = 'USA' WHERE country IS NULL`;
  });
  afterAll(() => sql.end());

  it("serializes the full study and validates against the official XSD", async () => {
    const data = await collectTmfExport(sql, studyId);
    const xml = buildExchangeXml(data, { agreementId: "FIXTURE-EA-001" });

    const versionCount = data.documents.reduce(
      (n, d) => n + ((d.versions as unknown[]) ?? []).length,
      0,
    );
    expect(xml.match(/<OBJECT>/g)).toHaveLength(versionCount);

    if (!hasXmllint) return; // structure still asserted above
    const dir = mkdtempSync(join(tmpdir(), "ems-"));
    const file = join(dir, "exchange.xml");
    writeFileSync(file, xml);
    // Throws (failing the test) if the document does not validate.
    execFileSync("xmllint", ["--noout", "--schema", XSD, file], { stdio: "pipe" });
  });
});
