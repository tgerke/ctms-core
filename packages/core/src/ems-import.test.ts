import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildExchangeXml, sriSha256 } from "./ems.js";
import {
  emsSourceRef,
  EmsImportError,
  parseExchangeXml,
  parseSri,
  planEmsImport,
  type EmsBatch,
  type ImportContext,
} from "./ems-import.js";
import type { TmfExportData } from "./export.js";

/**
 * eTMF-EMS import (ADR-0025), pure half: parsing a partner's exchange.xml and
 * planning its filing. The §4.1 receiving checks (checksums), §3.2.1 mapping
 * by UNIQUEID, and every refusal path are exercised without a database — the
 * API tests cover execution against the live filing surface.
 */

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const hashesOf = (bytes: Uint8Array) => ({
  sha256: createHash("sha256").update(bytes).digest("hex"),
  sha384: createHash("sha384").update(bytes).digest("hex"),
  sha512: createHash("sha512").update(bytes).digest("hex"),
});
const EMPTY_HASHES = hashesOf(new Uint8Array());

/** A partner batch the way another system would write it. */
function partnerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<BATCH xmlns="https://tmfrefmodel.com/ems" STUDYID="CORC-2201" TRANSFERSOURCEID="partner-etmf"
       TRANSFERID="20260712090000" SPECIFICATIONID="EA-42" TMFRMVERSION="3.3.1">
  <OBJECT>
    <OBJECTID>obj-100</OBJECTID>
    <OBJECTLEVEL>Trial</OBJECTLEVEL>
    <UNIQUEID>1234</UNIQUEID>
    <ARTIFACTNUMBER>01.01.01</ARTIFACTNUMBER>
    <OBJECTVERSION>1</OBJECTVERSION>
    <OBJECTVERSIONSTATE>Superseded</OBJECTVERSIONSTATE>
    <OBJECTTITLE>Protocol &amp; amendments</OBJECTTITLE>
    <OBJECTCOPY>No</OBJECTCOPY>
    <FILE>
      <INTEGRITY>${sriSha256(EMPTY_SHA256)}</INTEGRITY>
      <FILENAME>protocol-v1.pdf</FILENAME>
      <CONTENTURL>files/protocol-v1.pdf</CONTENTURL>
      <SIGNATURE>
        <SIGNATUREMETHODOLOGY>Electronic</SIGNATUREMETHODOLOGY>
        <USEROID>pi@partner.example</USEROID>
        <SIGNATURENAME>Dr. Partner</SIGNATURENAME>
        <SIGNATUREDATETIME>2026-01-01T10:00:00+00:00</SIGNATUREDATETIME>
        <SIGNATUREREASON>Approval</SIGNATUREREASON>
      </SIGNATURE>
    </FILE>
    <METADATA NAME="PARTNER_STATE">final</METADATA>
  </OBJECT>
  <OBJECT>
    <OBJECTID>obj-100</OBJECTID>
    <OBJECTLEVEL>Trial</OBJECTLEVEL>
    <UNIQUEID>1234</UNIQUEID>
    <ARTIFACTNUMBER>01.01.01</ARTIFACTNUMBER>
    <OBJECTVERSION>2</OBJECTVERSION>
    <OBJECTVERSIONSTATE>Current</OBJECTVERSIONSTATE>
    <OBJECTTITLE>Protocol &amp; amendments</OBJECTTITLE>
    <OBJECTCOPY>No</OBJECTCOPY>
    <FILE>
      <INTEGRITY>${sriSha256(EMPTY_SHA256)}</INTEGRITY>
      <FILENAME>protocol-v2.pdf</FILENAME>
      <CONTENTURL>files/protocol-v2.pdf</CONTENTURL>
    </FILE>
  </OBJECT>
  <OBJECT>
    <OBJECTID>obj-200</OBJECTID>
    <OBJECTLEVEL>Site</OBJECTLEVEL>
    <COUNTRYID>USA</COUNTRYID>
    <SITESYSTEMID>ps-1</SITESYSTEMID>
    <SITEID>001</SITEID>
    <UNIQUEID>5678</UNIQUEID>
    <ARTIFACTNUMBER>05.02.01</ARTIFACTNUMBER>
    <PERSONNAME>Ada Raman</PERSONNAME>
    <OBJECTVERSION>1</OBJECTVERSION>
    <OBJECTVERSIONSTATE>Current</OBJECTVERSIONSTATE>
    <OBJECTTITLE>CV Dr. Raman</OBJECTTITLE>
    <OBJECTCOPY>No</OBJECTCOPY>
    <FILE>
      <INTEGRITY>${sriSha256(EMPTY_SHA256)}</INTEGRITY>
      <FILENAME>cv.pdf</FILENAME>
      <CONTENTURL>files/cv.pdf</CONTENTURL>
    </FILE>
  </OBJECT>
</BATCH>
`;
}

function partnerContext(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    study: { id: "study-uuid", protocol_number: "CORC-2201" },
    artifactsByUniqueId: new Map([
      [1234, { id: 11, code: "01.01.01", name: "Trial Master File Plan" }],
      [5678, { id: 22, code: "05.02.01", name: "Curriculum Vitae" }],
    ]),
    sitesBySiteNumber: new Map([["001", { study_site_id: "ss-1", site_country: "USA" }]]),
    existingFilings: new Map(),
    fileHashes: new Map([
      ["files/protocol-v1.pdf", EMPTY_HASHES],
      ["files/protocol-v2.pdf", EMPTY_HASHES],
      ["files/cv.pdf", EMPTY_HASHES],
    ]),
    ...overrides,
  };
}

describe("parseExchangeXml (ADR-0025)", () => {
  it("parses a partner batch: attributes, objects, files, metadata", () => {
    const batch = parseExchangeXml(partnerXml());
    expect(batch.studyId).toBe("CORC-2201");
    expect(batch.transferSourceId).toBe("partner-etmf");
    expect(batch.specificationId).toBe("EA-42");
    expect(batch.tmfRmVersion).toBe("3.3.1");
    expect(batch.objects).toHaveLength(3);

    const [v1, , site] = batch.objects;
    expect(v1!.objectId).toBe("obj-100");
    expect(v1!.uniqueId).toBe(1234);
    expect(v1!.objectTitle).toBe("Protocol & amendments");
    expect(v1!.files[0]!.contentUrl).toBe("files/protocol-v1.pdf");
    expect(v1!.files[0]!.signatureCount).toBe(1);
    expect(v1!.metadata).toEqual([{ name: "PARTNER_STATE", value: "final" }]);
    expect(site!.objectLevel).toBe("Site");
    expect(site!.siteId).toBe("001");
    expect(site!.personNames).toEqual(["Ada Raman"]);
  });

  it("round-trips this system's own export", () => {
    const data: TmfExportData = {
      study: { id: "study-uuid", protocol_number: "SYN-0001" },
      documents: [
        {
          id: "doc-1",
          title: "Monitoring Plan",
          status: "effective",
          effective_date: "2026-01-20",
          expires_at: null,
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
              file_name: "plan.pdf",
              mime_type: "application/pdf",
              uploaded_at: "2026-01-02T08:00:00+00:00",
              source_system: null,
              source_ref: null,
            },
          ],
          signatures: [],
          returns: [],
        },
      ],
      expected: [],
      auditEvents: [],
      chain: { events: 0, valid: true, head_hash: null },
      blobs: [],
      tmfRmVersion: "99.9",
    };
    const xml = buildExchangeXml(data, { agreementId: "SYN-EA-001" });
    const batch = parseExchangeXml(xml);
    expect(batch.tmfRmVersion).toBe("99.9");
    expect(batch.objects).toHaveLength(1);
    expect(batch.objects[0]!.uniqueId).toBe(900003);
    expect(batch.objects[0]!.files[0]!.integrity).toBe(sriSha256(EMPTY_SHA256));
  });

  it("reports every structural gap at once", () => {
    const xml = `<?xml version="1.0"?>
<BATCH xmlns="https://tmfrefmodel.com/ems" STUDYID="X" TRANSFERSOURCEID="p" TRANSFERID="t" SPECIFICATIONID="s" TMFRMVERSION="3.3.1">
  <OBJECT>
    <OBJECTID>o-1</OBJECTID>
    <UNIQUEID>7</UNIQUEID>
  </OBJECT>
</BATCH>`;
    const err = (() => {
      try {
        parseExchangeXml(xml);
        return null;
      } catch (e) {
        return e as EmsImportError;
      }
    })();
    expect(err).toBeInstanceOf(EmsImportError);
    const joined = err!.problems.join("\n");
    expect(joined).toMatch(/OBJECTLEVEL/);
    expect(joined).toMatch(/ARTIFACTNUMBER/);
    expect(joined).toMatch(/no <FILE>/);
  });
});

describe("parseSri", () => {
  it("decodes the SRI sha256 our export emits back to the hex digest", () => {
    expect(parseSri(sriSha256(EMPTY_SHA256))).toEqual({
      algorithm: "sha256",
      hex: EMPTY_SHA256,
    });
  });
  it("rejects non-SRI values", () => {
    expect(parseSri(EMPTY_SHA256)).toBeNull();
    expect(parseSri("md5-abc=")).toBeNull();
  });
});

describe("planEmsImport (ADR-0025)", () => {
  it("threads iterations onto one document and maps by UNIQUEID", () => {
    const plan = planEmsImport(parseExchangeXml(partnerXml()), partnerContext());
    expect(plan.actions).toHaveLength(3);
    const [a1, a2, a3] = plan.actions;
    // obj-100 versions consecutive, in OBJECTVERSION order
    expect(a1!.sourceRef).toBe(emsSourceRef("obj-100", "1"));
    expect(a2!.sourceRef).toBe(emsSourceRef("obj-100", "2"));
    expect(a1!.tmfArtifactId).toBe(11);
    expect(a1!.studySiteId).toBeNull();
    // site-level object resolved by SITEID, person name deliberately unmapped
    expect(a3!.studySiteId).toBe("ss-1");
    expect(plan.warnings.join("\n")).toMatch(/PERSONNAME 'Ada Raman' not mapped/);
    // partner-asserted signature and audit records stay in the package
    expect(plan.warnings.join("\n")).toMatch(/1 signature\(s\) and 0 audit record\(s\).*not replayed/);
  });

  it("skips identical already-filed versions and threads onto the existing document", () => {
    const ctx = partnerContext({
      existingFilings: new Map([
        [
          "obj-100:1",
          { document_id: "doc-existing", sha256: EMPTY_SHA256, document_status: "pending_review" },
        ],
      ]),
    });
    const plan = planEmsImport(parseExchangeXml(partnerXml()), ctx);
    expect(plan.skipped).toEqual(["obj-100:1"]);
    const v2 = plan.actions.find((a) => a.sourceRef === "obj-100:2");
    expect(v2!.existingDocumentId).toBe("doc-existing");
  });

  it("refuses, all blockers at once: unknown UNIQUEID, unknown site, bad checksum", () => {
    const ctx = partnerContext({
      artifactsByUniqueId: new Map([
        [1234, { id: 11, code: "01.01.01", name: "Trial Master File Plan" }],
      ]),
      sitesBySiteNumber: new Map(),
      fileHashes: new Map([
        ["files/protocol-v1.pdf", hashesOf(new Uint8Array([1]))], // mismatch
        ["files/protocol-v2.pdf", EMPTY_HASHES],
        // files/cv.pdf absent from the package
      ]),
    });
    const err = (() => {
      try {
        planEmsImport(parseExchangeXml(partnerXml()), ctx);
        return null;
      } catch (e) {
        return e as EmsImportError;
      }
    })();
    expect(err).toBeInstanceOf(EmsImportError);
    const joined = err!.problems.join("\n");
    expect(joined).toMatch(/UNIQUEID 5678 matches no artifact/);
    expect(joined).toMatch(/SITEID '001' matches no site/);
    expect(joined).toMatch(/checksum mismatch for 'files\/protocol-v1.pdf'/);
    expect(joined).toMatch(/'files\/cv.pdf' not found in the package/);
  });

  it("refuses an un-imported taxonomy (no unique IDs anywhere)", () => {
    const ctx = partnerContext({ artifactsByUniqueId: new Map() });
    expect(() => planEmsImport(parseExchangeXml(partnerXml()), ctx)).toThrow(
      /db:import-tmf/,
    );
  });

  it("refuses a re-sent version whose content changed (versions are immutable)", () => {
    const ctx = partnerContext({
      existingFilings: new Map([
        [
          "obj-100:1",
          { document_id: "doc-x", sha256: "0".repeat(64), document_status: "pending_review" },
        ],
      ]),
    });
    expect(() => planEmsImport(parseExchangeXml(partnerXml()), ctx)).toThrow(
      /different content/,
    );
  });

  it("refuses country-level and RESTRICTED objects — no honest home in the schema", () => {
    const batch = parseExchangeXml(partnerXml());
    batch.objects[2]!.objectLevel = "Country";
    batch.objects[0]!.restricted = "Yes";
    const err = (() => {
      try {
        planEmsImport(batch, partnerContext());
        return null;
      } catch (e) {
        return e as EmsImportError;
      }
    })();
    const joined = err!.problems.join("\n");
    expect(joined).toMatch(/no country scope/);
    expect(joined).toMatch(/RESTRICTED=Yes/);
  });

  it("warns when ARTIFACTNUMBER disagrees with the imported taxonomy — UNIQUEID wins", () => {
    const ctx = partnerContext({
      artifactsByUniqueId: new Map([
        [1234, { id: 11, code: "01.01.02", name: "Renamed in a newer model" }],
        [5678, { id: 22, code: "05.02.01", name: "Curriculum Vitae" }],
      ]),
    });
    const plan = planEmsImport(parseExchangeXml(partnerXml()), ctx);
    expect(plan.warnings.join("\n")).toMatch(/UNIQUEID wins/);
    expect(plan.actions[0]!.tmfArtifactId).toBe(11);
  });
});

describe("EmsBatch typing", () => {
  it("emsSourceRef is the provenance key format the filings endpoint threads on", () => {
    const batch: EmsBatch = parseExchangeXml(partnerXml());
    expect(emsSourceRef(batch.objects[0]!.objectId, batch.objects[0]!.objectVersion)).toBe(
      "obj-100:1",
    );
  });
});
