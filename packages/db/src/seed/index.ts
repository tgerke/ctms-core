/**
 * Dev seed: two fictional prostate-cancer trials — a four-site Phase 2 with
 * a realistic mix of current, expiring, pending, expired, and missing
 * documents, and a smaller Phase 1b in startup (ADR-0021) — so the
 * completeness views, switcher, and portfolio tell a story on first run.
 * Destructive: truncates all tables (dev affordance only; production roles
 * would not hold TRUNCATE).
 */
import { createDb } from "../client.js";
import { backfillContentText } from "../content-text.js";
import * as s from "../schema.js";
import { putBlob } from "../storage.js";
import { makePdf } from "./pdf.js";
import { tmfSeed } from "./tmf.js";

const { sql, db } = createDb();

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return iso(d);
};
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const daysFromNow = (n: number) => daysAgo(-n);
const monthsFromNow = (n: number) => monthsAgo(-n);

// Attribute all seed writes in the audit trail.
await sql`SELECT set_config('ctms.actor_label', 'seed', false)`;

await sql`TRUNCATE audit_event, signature, document_return, document_version, document_content_text, expected_document,
  monitoring_visit_document, visit_action_item, issue, monitoring_visit,
  enrollment_report, study_milestone, access_grant,
  document, requirement_rule, study_site_role, study_site, protocol_version,
  requirement_rule, person, site, study, organization,
  tmf_artifact, tmf_section, tmf_zone RESTART IDENTITY CASCADE`;

// --- TMF taxonomy -----------------------------------------------------------
const artifactId = new Map<string, number>();
for (const zone of tmfSeed) {
  const [z] = await db
    .insert(s.tmfZone)
    .values({ number: zone.number, name: zone.name })
    .returning();
  for (const section of zone.sections) {
    const [sec] = await db
      .insert(s.tmfSection)
      .values({ zoneId: z!.id, code: section.code, name: section.name })
      .returning();
    for (const artifact of section.artifacts) {
      const [a] = await db
        .insert(s.tmfArtifact)
        .values({ sectionId: sec!.id, code: artifact.code, name: artifact.name })
        .returning();
      artifactId.set(artifact.code, a!.id);
    }
  }
}

// --- Organizations, study, sites -------------------------------------------
const [sponsor] = await db
  .insert(s.organization)
  .values({ name: "Cascade Oncology Research Consortium", kind: "sponsor" })
  .returning();
const [cro] = await db
  .insert(s.organization)
  .values({ name: "Meridian Clinical Services", kind: "cro" })
  .returning();

const [study] = await db
  .insert(s.study)
  .values({
    protocolNumber: "CORC-2201",
    title:
      "A Phase 2, Randomized Study of PARP Inhibition plus Androgen Receptor Blockade in Metastatic Castration-Resistant Prostate Cancer",
    phase: "2",
    status: "active",
    sponsorOrgId: sponsor!.id,
  })
  .returning();
const studyId = study!.id;

await db.insert(s.protocolVersion).values([
  { studyId, label: "v1.0", effectiveDate: monthsAgo(10) },
  { studyId, label: "Amendment 1 (v2.0)", effectiveDate: monthsAgo(4) },
]);

interface SiteSpec {
  number: string;
  org: string;
  name: string;
  city: string;
  state: string;
  status: "pending" | "active";
  activated: string | null;
  target: number;
}
const siteSpecs: SiteSpec[] = [
  { number: "001", org: "University Medical Center", name: "University Medical Center", city: "Portland", state: "OR", status: "active", activated: monthsAgo(8), target: 12 },
  { number: "002", org: "Lakeside Cancer Institute", name: "Lakeside Cancer Institute", city: "Chicago", state: "IL", status: "active", activated: monthsAgo(7), target: 10 },
  { number: "003", org: "Harbor View Regional Hospital", name: "Harbor View Regional Hospital", city: "Charleston", state: "SC", status: "active", activated: monthsAgo(5), target: 8 },
  { number: "004", org: "Prairie Regional Medical Center", name: "Prairie Regional Medical Center", city: "Fargo", state: "ND", status: "pending", activated: null, target: 6 },
];

const studySiteId = new Map<string, string>();
for (const spec of siteSpecs) {
  const [org] = await db
    .insert(s.organization)
    .values({ name: spec.org, kind: "site_org" })
    .returning();
  const [site] = await db
    .insert(s.site)
    .values({ organizationId: org!.id, name: spec.name, city: spec.city, state: spec.state })
    .returning();
  const [ss] = await db
    .insert(s.studySite)
    .values({
      studyId,
      siteId: site!.id,
      siteNumber: spec.number,
      status: spec.status,
      activatedAt: spec.activated,
      targetEnrollment: spec.target,
    })
    .returning();
  studySiteId.set(spec.number, ss!.id);
}

// --- People and roles --------------------------------------------------------
type Role = "principal_investigator" | "sub_investigator" | "study_coordinator" | "pharmacist" | "research_nurse";
interface PersonSpec {
  key: string;
  given: string;
  family: string;
  credentials: string | null;
  site: string | null; // site number; null = sponsor/CRO staff
  role: Role | null;
}
const personSpecs: PersonSpec[] = [
  // Site 001
  { key: "vasquez", given: "Elena", family: "Vasquez", credentials: "MD", site: "001", role: "principal_investigator" },
  { key: "webb", given: "Marcus", family: "Webb", credentials: "MD, PhD", site: "001", role: "sub_investigator" },
  { key: "kim", given: "Dana", family: "Kim", credentials: "CCRC", site: "001", role: "study_coordinator" },
  { key: "reyes", given: "Alan", family: "Reyes", credentials: "PharmD", site: "001", role: "pharmacist" },
  // Site 002
  { key: "raman", given: "Priya", family: "Raman", credentials: "MD", site: "002", role: "principal_investigator" },
  { key: "oduya", given: "Tom", family: "Oduya", credentials: "CCRP", site: "002", role: "study_coordinator" },
  { key: "lin", given: "Grace", family: "Lin", credentials: "RN", site: "002", role: "research_nurse" },
  // Site 003
  { key: "whitfield", given: "James", family: "Whitfield", credentials: "MD", site: "003", role: "principal_investigator" },
  { key: "cole", given: "Sarah", family: "Cole", credentials: "DO", site: "003", role: "sub_investigator" },
  { key: "torres", given: "Mia", family: "Torres", credentials: "BSN, CCRC", site: "003", role: "study_coordinator" },
  // Site 004
  { key: "bergstrom", given: "Olaf", family: "Bergstrom", credentials: "MD", site: "004", role: "principal_investigator" },
  { key: "hoff", given: "Jenna", family: "Hoff", credentials: "CCRC", site: "004", role: "study_coordinator" },
  // Sponsor / CRO staff (no site role)
  { key: "feld", given: "Nora", family: "Feld", credentials: "MPH", site: null, role: null },
  { key: "patel", given: "Ravi", family: "Patel", credentials: "CCRA", site: null, role: null },
  // Machine identity (ADR-0011): the EDC's filing worker authenticates as this
  // person record (dev-service-token, or an OIDC client subject mapped via
  // API_SERVICE_SUBJECTS) and files documents with provenance.
  { key: "edc", given: "EDC", family: "Filing", credentials: null, site: null, role: null },
];

const personId = new Map<string, string>();
for (const spec of personSpecs) {
  const email = `${spec.given.toLowerCase()}.${spec.family.toLowerCase()}@${
    spec.site ? "site" + spec.site : spec.key === "patel" ? "meridiancro" : "corc"
  }.example`;
  const [p] = await db
    .insert(s.person)
    .values({
      givenName: spec.given,
      familyName: spec.family,
      email,
      credentials: spec.credentials,
    })
    .returning();
  personId.set(spec.key, p!.id);
  if (spec.site && spec.role) {
    await db.insert(s.studySiteRole).values({
      studySiteId: studySiteId.get(spec.site)!,
      personId: p!.id,
      role: spec.role,
      startDate: siteSpecs.find((x) => x.number === spec.site)!.activated ?? daysAgo(30),
    });
  }
}

// --- System access grants (ADR-0008) ------------------------------------------
// Feld runs trial operations end to end (admin covers sync-expected); Patel
// monitors — reads, uploads, and non-approval signatures, no approvals.
await db.insert(s.accessGrant).values([
  { personId: personId.get("feld")!, role: "admin" },
  { personId: personId.get("patel")!, role: "monitor" },
  // Least privilege for the machine identity: ingest (read + upload, never
  // sign), scoped to the one study it files for.
  { personId: personId.get("edc")!, role: "ingest", studyId },
]);

// --- Requirement rules -------------------------------------------------------
type ScopeLevel = "study" | "study_site" | "person_role";
interface RuleSpec {
  artifact: string;
  scope: ScopeLevel;
  name: string;
  roles?: Role[];
  validityMonths?: number;
  requiresSignature?: boolean;
}
const ruleSpecs: RuleSpec[] = [
  { artifact: "02.01.01", scope: "study", name: "Current signed protocol on file", requiresSignature: true },
  { artifact: "02.02.01", scope: "study", name: "Investigator's Brochure (annual re-issue)", validityMonths: 12 },
  { artifact: "01.01.03", scope: "study", name: "Monitoring plan on file" },
  { artifact: "10.01.01", scope: "study", name: "Data management plan on file" },
  { artifact: "11.01.01", scope: "study", name: "Statistical analysis plan on file" },
  { artifact: "02.04.01", scope: "study", name: "Master informed consent form" },
  { artifact: "03.02.01", scope: "study", name: "Trial registration current" },
  { artifact: "04.01.02", scope: "study_site", name: "IRB approval (continuing review annually)", validityMonths: 12 },
  { artifact: "04.01.04", scope: "study_site", name: "IRB-approved site consent form" },
  { artifact: "05.01.04", scope: "study_site", name: "Executed clinical trial agreement" },
  { artifact: "05.02.05", scope: "study_site", name: "Form FDA 1572 (signed)", requiresSignature: true },
  { artifact: "05.03.01", scope: "study_site", name: "Delegation of authority log (signed)", requiresSignature: true },
  { artifact: "05.01.02", scope: "study_site", name: "Site initiation visit report" },
  { artifact: "08.01.01", scope: "study_site", name: "Laboratory accreditation", validityMonths: 24 },
  { artifact: "06.01.02", scope: "study_site", name: "IP accountability log" },
  { artifact: "05.02.01", scope: "person_role", name: "CV no older than 2 years", validityMonths: 24 },
  { artifact: "05.02.02", scope: "person_role", name: "Current medical license", roles: ["principal_investigator", "sub_investigator"], validityMonths: 12 },
  { artifact: "05.02.03", scope: "person_role", name: "GCP training within 3 years", validityMonths: 36 },
  { artifact: "05.02.04", scope: "person_role", name: "Financial disclosure form", roles: ["principal_investigator", "sub_investigator"] },
];

for (const r of ruleSpecs) {
  await db.insert(s.requirementRule).values({
    studyId,
    tmfArtifactId: artifactId.get(r.artifact)!,
    scopeLevel: r.scope,
    appliesToRoles: r.roles ?? null,
    validityMonths: r.validityMonths ?? null,
    requiresSignature: r.requiresSignature ?? false,
    name: r.name,
  });
}

const [{ synced }] = await sql<[{ synced: number }]>`
  SELECT ctms_sync_expected_documents(${studyId}) AS synced`;
console.log(`expected documents materialized: ${synced}`);

// --- Documents ---------------------------------------------------------------
interface DocSpec {
  artifact: string;
  title: string;
  site?: string;
  person?: string;
  status?: "pending_review" | "effective" | "superseded" | "returned";
  effective?: string;
  uploadedBy?: string;
  versions?: string[]; // version labels; default one
  sign?: { by: string; meaning: "author" | "review" | "approval" };
  // Return-for-correction fact (ADR-0015); pair with status: "returned".
  returned?: { by: string; reason: string };
}

async function addDoc(spec: DocSpec) {
  const status = spec.status ?? "effective";
  const [doc] = await db
    .insert(s.document)
    .values({
      tmfArtifactId: artifactId.get(spec.artifact)!,
      studyId,
      studySiteId: spec.site ? studySiteId.get(spec.site)! : null,
      personId: spec.person ? personId.get(spec.person)! : null,
      title: spec.title,
      status,
      effectiveDate:
        status === "pending_review" || status === "returned"
          ? null
          : (spec.effective ?? null),
    })
    .returning();
  const labels = spec.versions ?? ["v1.0"];
  let lastSha = "";
  for (let i = 0; i < labels.length; i++) {
    const pdf = makePdf([
      spec.title,
      "Study CORC-2201 — Cascade Oncology Research Consortium",
      spec.site ? `Site ${spec.site}` : "Study level",
      `Version ${labels[i]}`,
      spec.effective ? `Effective ${spec.effective}` : "Pending review",
      "Demo document generated by ctms-core seed.",
    ]);
    const { sha256, sizeBytes } = await putBlob(pdf);
    lastSha = sha256;
    await db.insert(s.documentVersion).values({
      documentId: doc!.id,
      versionNumber: i + 1,
      sha256,
      fileName: `${spec.title.replace(/[^A-Za-z0-9]+/g, "_")}_${labels[i]}.pdf`,
      mimeType: "application/pdf",
      sizeBytes,
      uploadedBy: personId.get(spec.uploadedBy ?? "feld")!,
    });
  }
  if (spec.returned) {
    const [version] = await sql<[{ id: string }]>`
      SELECT id FROM document_version WHERE document_id = ${doc!.id}
      ORDER BY version_number DESC LIMIT 1`;
    await db.insert(s.documentReturn).values({
      documentVersionId: version!.id,
      returnedBy: personId.get(spec.returned.by)!,
      reason: spec.returned.reason,
    });
  }
  if (spec.sign) {
    const [version] = await sql<[{ id: string }]>`
      SELECT id FROM document_version WHERE document_id = ${doc!.id}
      ORDER BY version_number DESC LIMIT 1`;
    await db.insert(s.signature).values({
      documentVersionId: version!.id,
      signerPersonId: personId.get(spec.sign.by)!,
      meaning: spec.sign.meaning,
      signedSha256: lastSha,
      // Demo fixtures: no real §11.200 ceremony happened, and the value says so.
      reauthMethod: "seed_fixture",
      reauthAt: new Date(),
    });
  }
  return doc!;
}

// Study-level: all present. Protocol carries two versions (v1 + amendment).
await addDoc({ artifact: "02.01.01", title: "Protocol CORC-2201", effective: monthsAgo(4), versions: ["v1.0", "v2.0 (Amendment 1)"], sign: { by: "feld", meaning: "approval" } });
await addDoc({ artifact: "02.02.01", title: "Investigator's Brochure — Talzenna/ARB Combination", effective: monthsAgo(8) });
await addDoc({ artifact: "01.01.03", title: "Clinical Monitoring Plan", effective: monthsAgo(9), uploadedBy: "patel" });
await addDoc({ artifact: "10.01.01", title: "Data Management Plan", effective: monthsAgo(9) });
await addDoc({ artifact: "11.01.01", title: "Statistical Analysis Plan v1.0", effective: monthsAgo(7) });
await addDoc({ artifact: "02.04.01", title: "Master Informed Consent Form v2.0", effective: monthsAgo(4) });
await addDoc({ artifact: "03.02.01", title: "ClinicalTrials.gov Registration NCT0XXXXXXX", effective: monthsAgo(10) });

// --- Site 001 (flagship: nearly complete, one expired license, one aging CV)
await addDoc({ artifact: "04.01.02", title: "IRB Approval — Site 001", site: "001", effective: monthsAgo(8) });
await addDoc({ artifact: "04.01.04", title: "IRB-Approved Consent Form — Site 001", site: "001", effective: monthsAgo(8) });
await addDoc({ artifact: "05.01.04", title: "Clinical Trial Agreement — Site 001", site: "001", effective: monthsAgo(9) });
await addDoc({ artifact: "05.02.05", title: "Form FDA 1572 — Vasquez", site: "001", effective: monthsAgo(8), sign: { by: "vasquez", meaning: "approval" } });
await addDoc({ artifact: "05.03.01", title: "Delegation of Authority Log — Site 001", site: "001", effective: monthsAgo(8), sign: { by: "vasquez", meaning: "approval" } });
await addDoc({ artifact: "05.01.02", title: "Site Initiation Visit Report — Site 001", site: "001", effective: monthsAgo(8), uploadedBy: "patel" });
await addDoc({ artifact: "08.01.01", title: "CAP Accreditation — UMC Central Laboratory", site: "001", effective: monthsAgo(10) });
await addDoc({ artifact: "06.01.02", title: "IP Accountability Log — Site 001", site: "001", effective: monthsAgo(8) });
// Staff 001
await addDoc({ artifact: "05.02.01", title: "CV — Elena Vasquez, MD", site: "001", person: "vasquez", effective: monthsAgo(6) });
await addDoc({ artifact: "05.02.02", title: "Medical License — Vasquez (OR)", site: "001", person: "vasquez", effective: monthsAgo(3) });
await addDoc({ artifact: "05.02.03", title: "GCP Certificate — Vasquez", site: "001", person: "vasquez", effective: monthsAgo(12) });
await addDoc({ artifact: "05.02.04", title: "Financial Disclosure — Vasquez", site: "001", person: "vasquez", effective: monthsAgo(8) });
await addDoc({ artifact: "05.02.01", title: "CV — Marcus Webb, MD, PhD", site: "001", person: "webb", effective: monthsAgo(10) });
// Webb's license: effective 13 months ago with 12-month validity -> EXPIRED
await addDoc({ artifact: "05.02.02", title: "Medical License — Webb (OR)", site: "001", person: "webb", effective: monthsAgo(13) });
await addDoc({ artifact: "05.02.03", title: "GCP Certificate — Webb", site: "001", person: "webb", effective: monthsAgo(20) });
await addDoc({ artifact: "05.02.04", title: "Financial Disclosure — Webb", site: "001", person: "webb", effective: monthsAgo(8) });
// Kim's CV: 23 months old with 24-month validity -> EXPIRING SOON
await addDoc({ artifact: "05.02.01", title: "CV — Dana Kim, CCRC", site: "001", person: "kim", effective: monthsAgo(23) });
await addDoc({ artifact: "05.02.03", title: "GCP Certificate — Kim", site: "001", person: "kim", effective: monthsAgo(30) });
await addDoc({ artifact: "05.02.01", title: "CV — Alan Reyes, PharmD", site: "001", person: "reyes", effective: monthsAgo(5) });
await addDoc({ artifact: "05.02.03", title: "GCP Certificate — Reyes", site: "001", person: "reyes", effective: monthsAgo(10) });

// --- Site 002 (IRB renewal in review; coordinator missing GCP)
// Original IRB approval superseded; continuing-review approval awaiting QC.
await addDoc({ artifact: "04.01.02", title: "IRB Approval — Site 002 (initial)", site: "002", status: "superseded", effective: monthsAgo(13) });
const docIrbRenewal002 = await addDoc({ artifact: "04.01.02", title: "IRB Continuing Review Approval — Site 002", site: "002", status: "pending_review", uploadedBy: "oduya" });
await addDoc({ artifact: "04.01.04", title: "IRB-Approved Consent Form — Site 002", site: "002", effective: monthsAgo(7) });
await addDoc({ artifact: "05.01.04", title: "Clinical Trial Agreement — Site 002", site: "002", effective: monthsAgo(8) });
await addDoc({ artifact: "05.02.05", title: "Form FDA 1572 — Raman", site: "002", effective: monthsAgo(7), sign: { by: "raman", meaning: "approval" } });
await addDoc({ artifact: "05.03.01", title: "Delegation of Authority Log — Site 002", site: "002", effective: monthsAgo(7), sign: { by: "raman", meaning: "approval" } });
await addDoc({ artifact: "05.01.02", title: "Site Initiation Visit Report — Site 002", site: "002", effective: monthsAgo(7), uploadedBy: "patel" });
await addDoc({ artifact: "08.01.01", title: "CLIA Certificate — Lakeside Laboratory", site: "002", effective: monthsAgo(7) });
await addDoc({ artifact: "06.01.02", title: "IP Accountability Log — Site 002", site: "002", effective: monthsAgo(7) });
// Staff 002 (Oduya has NO GCP certificate -> missing)
await addDoc({ artifact: "05.02.01", title: "CV — Priya Raman, MD", site: "002", person: "raman", effective: monthsAgo(4) });
await addDoc({ artifact: "05.02.02", title: "Medical License — Raman (IL)", site: "002", person: "raman", effective: monthsAgo(2) });
await addDoc({ artifact: "05.02.03", title: "GCP Certificate — Raman", site: "002", person: "raman", effective: monthsAgo(14) });
await addDoc({ artifact: "05.02.04", title: "Financial Disclosure — Raman", site: "002", person: "raman", effective: monthsAgo(7) });
await addDoc({ artifact: "05.02.01", title: "CV — Tom Oduya, CCRP", site: "002", person: "oduya", effective: monthsAgo(6) });
await addDoc({ artifact: "05.02.01", title: "CV — Grace Lin, RN", site: "002", person: "lin", effective: monthsAgo(3) });
await addDoc({ artifact: "05.02.03", title: "GCP Certificate — Lin", site: "002", person: "lin", effective: monthsAgo(8) });

// --- Site 003 (missing DoA log + lab accreditation; Cole license expiring;
// --- Torres GCP certificate returned for correction)
await addDoc({ artifact: "04.01.02", title: "IRB Approval — Site 003", site: "003", effective: monthsAgo(5) });
await addDoc({ artifact: "04.01.04", title: "IRB-Approved Consent Form — Site 003", site: "003", effective: monthsAgo(5) });
await addDoc({ artifact: "05.01.04", title: "Clinical Trial Agreement — Site 003", site: "003", effective: monthsAgo(6) });
await addDoc({ artifact: "05.02.05", title: "Form FDA 1572 — Whitfield", site: "003", effective: monthsAgo(5), sign: { by: "whitfield", meaning: "approval" } });
await addDoc({ artifact: "05.01.02", title: "Site Initiation Visit Report — Site 003", site: "003", effective: monthsAgo(5), uploadedBy: "patel" });
await addDoc({ artifact: "06.01.02", title: "IP Accountability Log — Site 003", site: "003", effective: monthsAgo(5) });
// Staff 003
await addDoc({ artifact: "05.02.01", title: "CV — James Whitfield, MD", site: "003", person: "whitfield", effective: monthsAgo(9) });
await addDoc({ artifact: "05.02.02", title: "Medical License — Whitfield (SC)", site: "003", person: "whitfield", effective: monthsAgo(4) });
await addDoc({ artifact: "05.02.03", title: "GCP Certificate — Whitfield", site: "003", person: "whitfield", effective: monthsAgo(18) });
await addDoc({ artifact: "05.02.04", title: "Financial Disclosure — Whitfield", site: "003", person: "whitfield", effective: monthsAgo(5) });
await addDoc({ artifact: "05.02.01", title: "CV — Sarah Cole, DO", site: "003", person: "cole", effective: monthsAgo(7) });
// Cole's license: 11 months into 12-month validity -> EXPIRING SOON
await addDoc({ artifact: "05.02.02", title: "Medical License — Cole (SC)", site: "003", person: "cole", effective: monthsAgo(11) });
await addDoc({ artifact: "05.02.03", title: "GCP Certificate — Cole", site: "003", person: "cole", effective: monthsAgo(24) });
await addDoc({ artifact: "05.02.04", title: "Financial Disclosure — Cole", site: "003", person: "cole", effective: monthsAgo(5) });
await addDoc({ artifact: "05.02.01", title: "CV — Mia Torres, BSN, CCRC", site: "003", person: "torres", effective: monthsAgo(2) });
// Returned for correction (ADR-0015): scan unreadable, sent back by the sponsor.
await addDoc({
  artifact: "05.02.03",
  title: "GCP Certificate — Torres",
  site: "003",
  person: "torres",
  status: "returned",
  uploadedBy: "torres",
  returned: { by: "feld", reason: "Certificate scan is cut off — completion date and provider are not legible. Please upload a full-page scan." },
});

// --- Site 004 (pending activation: mostly missing, startup docs trickling in)
await addDoc({ artifact: "05.01.04", title: "Clinical Trial Agreement — Site 004", site: "004", effective: daysAgo(20) });
await addDoc({ artifact: "04.01.02", title: "IRB Approval — Site 004", site: "004", effective: daysAgo(10) });
await addDoc({ artifact: "05.02.01", title: "CV — Olaf Bergstrom, MD", site: "004", person: "bergstrom", effective: daysAgo(15) });

// --- Review assignment (ADR-0018): the IRB renewal review is routed to Feld
// and already past due, so the queue and the digest have an overdue example.
{
  const [version] = await sql<[{ id: string }]>`
    SELECT id FROM document_version WHERE document_id = ${docIrbRenewal002.id}
    ORDER BY version_number DESC LIMIT 1`;
  await db.insert(s.reviewAssignment).values({
    documentVersionId: version!.id,
    assignedTo: personId.get("feld")!,
    assignedBy: personId.get("feld")!,
    dueDate: daysAgo(2),
    note: "QC against the IRB letter before the continuing-review window closes.",
  });
}

// --- Operational layer: monitoring visits ------------------------------------
// One visit per derived stage so v_monitoring_visit_status tells a story:
// complete, follow_up, report_pending_review, awaiting_report, overdue, scheduled.

interface VisitSpec {
  key: string;
  site: string;
  type: "pre_study" | "initiation" | "interim" | "close_out";
  scheduled: string;
  conducted?: string;
  monitor?: string;
  summary?: string;
  report?: { title: string; status?: "pending_review" | "effective"; approve?: boolean };
  actionItems?: { description: string; due?: string; resolved?: string; note?: string }[];
}
const visitSpecs: VisitSpec[] = [
  {
    key: "v001-init", site: "001", type: "initiation",
    scheduled: monthsAgo(8), conducted: monthsAgo(8), monitor: "patel",
    summary: "Site initiation completed; pharmacy and regulatory binders verified.",
    report: { title: "Initiation Visit Trip Report — Site 001", approve: true },
    actionItems: [
      { description: "Provide updated pharmacy temperature log SOP", due: monthsAgo(7), resolved: monthsAgo(7), note: "SOP v3 filed" },
    ],
  },
  {
    key: "v001-int1", site: "001", type: "interim",
    scheduled: monthsAgo(2), conducted: monthsAgo(2), monitor: "patel",
    summary: "Interim monitoring: informed consent review clean; two staff-file gaps.",
    report: { title: "Interim Visit 1 Trip Report — Site 001", approve: true },
    actionItems: [
      { description: "Renew Dr. Webb's Oregon medical license and file copy", due: daysAgo(14) },
      { description: "Collect updated CV for coordinator Dana Kim", due: daysFromNow(21) },
      { description: "Correct subject 001-004 visit-window deviation note", due: monthsAgo(1), resolved: daysAgo(20), note: "Note-to-file signed by PI" },
    ],
  },
  {
    key: "v002-int1", site: "002", type: "interim",
    scheduled: daysAgo(12), conducted: daysAgo(10), monitor: "patel",
    summary: "Interim monitoring: IRB continuing-review lapse window reviewed.",
    report: { title: "Interim Visit 1 Trip Report — Site 002", status: "pending_review" },
    actionItems: [
      { description: "Submit IRB continuing-review approval once issued", due: daysFromNow(14) },
    ],
  },
  {
    key: "v002-int2", site: "002", type: "interim",
    scheduled: daysFromNow(30), monitor: "patel",
  },
  {
    key: "v003-int1", site: "003", type: "interim",
    scheduled: daysAgo(5), conducted: daysAgo(3), monitor: "patel",
    summary: "Visit conducted; trip report in preparation.",
  },
  {
    key: "v003-init", site: "003", type: "initiation",
    scheduled: daysAgo(45), monitor: "patel", // never conducted -> overdue
  },
  {
    key: "v004-psv", site: "004", type: "pre_study",
    scheduled: daysFromNow(10), monitor: "patel",
  },
];

const visitId = new Map<string, string>();
for (const v of visitSpecs) {
  const [mv] = await db
    .insert(s.monitoringVisit)
    .values({
      studySiteId: studySiteId.get(v.site)!,
      visitType: v.type,
      scheduledDate: v.scheduled,
      visitDate: v.conducted ?? null,
      monitorPersonId: v.monitor ? personId.get(v.monitor)! : null,
      summary: v.summary ?? null,
    })
    .returning();
  visitId.set(v.key, mv!.id);

  if (v.report) {
    const doc = await addDoc({
      artifact: "01.03.01",
      title: v.report.title,
      site: v.site,
      status: v.report.status ?? "effective",
      effective: v.report.status === "pending_review" ? undefined : v.conducted,
      uploadedBy: "patel",
      sign: v.report.approve ? { by: "feld", meaning: "approval" } : undefined,
    });
    await db.insert(s.monitoringVisitDocument).values({
      monitoringVisitId: mv!.id,
      documentId: doc.id,
      linkKind: "trip_report",
    });
  }
  for (const ai of v.actionItems ?? []) {
    await db.insert(s.visitActionItem).values({
      monitoringVisitId: mv!.id,
      description: ai.description,
      dueDate: ai.due ?? null,
      resolvedAt: ai.resolved ?? null,
      resolvedBy: ai.resolved ? personId.get("patel")! : null,
      resolutionNote: ai.note ?? null,
    });
  }
}

// --- Operational layer: issues ------------------------------------------------
const issueSpecs: {
  site?: string;
  visit?: string;
  category: "protocol_deviation" | "monitoring_finding" | "safety" | "data_quality" | "other";
  severity: "minor" | "major" | "critical";
  title: string;
  description?: string;
  identified: string;
  identifiedBy?: string;
  due?: string;
  resolved?: string;
  note?: string;
}[] = [
  {
    site: "001", visit: "v001-int1", category: "protocol_deviation", severity: "minor",
    title: "Subject 001-004 visit outside protocol window",
    description: "Cycle 3 visit occurred 3 days outside the ±5-day window.",
    identified: monthsAgo(2), identifiedBy: "patel", due: monthsAgo(1),
    resolved: daysAgo(20), note: "Note-to-file signed by PI; no impact on safety or efficacy data.",
  },
  {
    site: "002", visit: "v002-int1", category: "monitoring_finding", severity: "major",
    title: "IRB continuing review not completed before anniversary date",
    description: "Continuing-review approval still pending at IRB; enrollment paused on-site.",
    identified: daysAgo(10), identifiedBy: "patel", due: daysAgo(2),
  },
  {
    site: "002", category: "protocol_deviation", severity: "major",
    title: "IP dispensed without current accountability log entry",
    identified: daysAgo(8), identifiedBy: "patel", due: daysFromNow(14),
  },
  {
    site: "003", category: "safety", severity: "critical",
    title: "SAE reported to sponsor outside 24-hour window",
    description: "Grade 3 event reported 4 days after site awareness.",
    identified: daysAgo(6), identifiedBy: "feld", due: daysFromNow(7),
  },
  {
    category: "data_quality", severity: "minor",
    title: "eCRF query aging exceeds 30 days across sites",
    identified: daysAgo(15), identifiedBy: "feld", due: daysFromNow(30),
  },
];
for (const i of issueSpecs) {
  await db.insert(s.issue).values({
    studyId,
    studySiteId: i.site ? studySiteId.get(i.site)! : null,
    monitoringVisitId: i.visit ? visitId.get(i.visit)! : null,
    category: i.category,
    severity: i.severity,
    title: i.title,
    description: i.description ?? null,
    identifiedDate: i.identified,
    identifiedBy: i.identifiedBy ? personId.get(i.identifiedBy)! : null,
    dueDate: i.due ?? null,
    resolvedAt: i.resolved ?? null,
    resolvedBy: i.resolved ? personId.get("feld")! : null,
    resolutionNote: i.note ?? null,
  });
}

// --- Operational layer: enrollment reports ------------------------------------
// Aggregates as reported by sites (EDC owns subject-level data; see ADR-0006).
const enrollmentSpecs: { site: string; asOf: string; screened: number; enrolled: number; withdrawn: number; completed: number }[] = [
  { site: "001", asOf: monthsAgo(1), screened: 14, enrolled: 9, withdrawn: 1, completed: 2 },
  { site: "001", asOf: daysAgo(7), screened: 16, enrolled: 11, withdrawn: 1, completed: 3 },
  { site: "002", asOf: monthsAgo(1), screened: 6, enrolled: 3, withdrawn: 0, completed: 0 },
  { site: "002", asOf: daysAgo(7), screened: 7, enrolled: 3, withdrawn: 1, completed: 0 },
  { site: "003", asOf: daysAgo(14), screened: 9, enrolled: 5, withdrawn: 0, completed: 1 },
];
for (const e of enrollmentSpecs) {
  await db.insert(s.enrollmentReport).values({
    studySiteId: studySiteId.get(e.site)!,
    asOfDate: e.asOf,
    screened: e.screened,
    enrolled: e.enrolled,
    withdrawn: e.withdrawn,
    completed: e.completed,
    reportedBy: personId.get("feld")!,
  });
}

// --- Operational layer: study milestones ---------------------------------------
const milestoneSpecs: { site?: string; name: string; planned: string; actual?: string }[] = [
  { name: "First site activated", planned: monthsAgo(9), actual: monthsAgo(8) },
  { name: "First participant enrolled", planned: monthsAgo(7), actual: monthsAgo(6) },
  { name: "50% enrollment", planned: monthsAgo(1) }, // overdue
  { name: "Last participant enrolled", planned: monthsFromNow(6) },
  { name: "Database lock", planned: monthsFromNow(12) },
  { site: "004", name: "Site activation", planned: daysAgo(15) }, // overdue
];
for (const m of milestoneSpecs) {
  await db.insert(s.studyMilestone).values({
    studyId,
    studySiteId: m.site ? studySiteId.get(m.site)! : null,
    name: m.name,
    plannedDate: m.planned,
    actualDate: m.actual ?? null,
  });
}

// --- Second study: CORC-2202 (portfolio demo, ADR-0021) ------------------------
// A younger, smaller trial sharing two physical sites with CORC-2201, so the
// portfolio page and study switcher have a real contrast: an established
// Phase 2 with realistic gaps next to a Phase 1b in startup.
const [study2] = await db
  .insert(s.study)
  .values({
    protocolNumber: "CORC-2202",
    title:
      "A Phase 1b Dose-Escalation Study of a Novel Radioligand in Progressive Metastatic Prostate Cancer",
    phase: "1b",
    status: "active",
    sponsorOrgId: sponsor!.id,
  })
  .returning();
const study2Id = study2!.id;
await db.insert(s.protocolVersion).values({ studyId: study2Id, label: "v1.0", effectiveDate: monthsAgo(3) });

const siteIdByName = new Map<string, string>();
for (const row of await sql`SELECT id, name FROM site`) {
  siteIdByName.set(row.name as string, row.id as string);
}
const study2SiteId = new Map<string, string>();
for (const spec of [
  { number: "001", site: "University Medical Center", status: "active" as const, activated: monthsAgo(2), target: 8 },
  { number: "002", site: "Lakeside Cancer Institute", status: "pending" as const, activated: null, target: 6 },
]) {
  const [ss] = await db
    .insert(s.studySite)
    .values({
      studyId: study2Id,
      siteId: siteIdByName.get(spec.site)!,
      siteNumber: spec.number,
      status: spec.status,
      activatedAt: spec.activated,
      targetEnrollment: spec.target,
    })
    .returning();
  study2SiteId.set(spec.number, ss!.id);
}
for (const r of [
  { person: "vasquez", role: "principal_investigator" as const },
  { person: "kim", role: "study_coordinator" as const },
]) {
  await db.insert(s.studySiteRole).values({
    studySiteId: study2SiteId.get("001")!,
    personId: personId.get(r.person)!,
    role: r.role,
    startDate: monthsAgo(2),
  });
}
for (const r of [
  { artifact: "02.01.01", scope: "study" as const, name: "Current signed protocol on file", requiresSignature: true },
  { artifact: "02.02.01", scope: "study" as const, name: "Investigator's Brochure (annual re-issue)", validityMonths: 12 },
  { artifact: "04.01.02", scope: "study_site" as const, name: "IRB approval (continuing review annually)", validityMonths: 12 },
  { artifact: "05.02.01", scope: "person_role" as const, name: "CV no older than 2 years", validityMonths: 24 },
]) {
  await db.insert(s.requirementRule).values({
    studyId: study2Id,
    tmfArtifactId: artifactId.get(r.artifact)!,
    scopeLevel: r.scope,
    validityMonths: r.validityMonths ?? null,
    requiresSignature: r.requiresSignature ?? false,
    name: r.name,
  });
}
await sql`SELECT ctms_sync_expected_documents(${study2Id})`;

async function addDoc2(spec: {
  artifact: string;
  title: string;
  site?: string;
  person?: string;
  effective: string;
  sign?: boolean;
}) {
  const [doc] = await db
    .insert(s.document)
    .values({
      tmfArtifactId: artifactId.get(spec.artifact)!,
      studyId: study2Id,
      studySiteId: spec.site ? study2SiteId.get(spec.site)! : null,
      personId: spec.person ? personId.get(spec.person)! : null,
      title: spec.title,
      status: "effective",
      effectiveDate: spec.effective,
    })
    .returning();
  const pdf = makePdf([
    spec.title,
    "Study CORC-2202 — Cascade Oncology Research Consortium",
    spec.site ? `Site ${spec.site}` : "Study level",
    `Effective ${spec.effective}`,
    "Demo document generated by ctms-core seed.",
  ]);
  const { sha256, sizeBytes } = await putBlob(pdf);
  const [version] = await db
    .insert(s.documentVersion)
    .values({
      documentId: doc!.id,
      versionNumber: 1,
      sha256,
      fileName: `${spec.title.replace(/[^A-Za-z0-9]+/g, "_")}_v1.0.pdf`,
      mimeType: "application/pdf",
      sizeBytes,
      uploadedBy: personId.get("feld")!,
    })
    .returning();
  if (spec.sign) {
    await db.insert(s.signature).values({
      documentVersionId: version!.id,
      signerPersonId: personId.get("feld")!,
      meaning: "approval",
      signedSha256: sha256,
      reauthMethod: "seed_fixture",
      reauthAt: new Date(),
    });
  }
}
// Startup story: protocol and IB filed, site 001's IRB approval and the PI's
// CV on file; site 002 (pending) and Kim's CV are honest gaps.
await addDoc2({ artifact: "02.01.01", title: "Protocol CORC-2202", effective: monthsAgo(3), sign: true });
await addDoc2({ artifact: "02.02.01", title: "Investigator's Brochure — Radioligand RL-208", effective: monthsAgo(1) });
await addDoc2({ artifact: "04.01.02", title: "IRB Approval — Site 001 (CORC-2202)", site: "001", effective: monthsAgo(2) });
await addDoc2({ artifact: "05.02.01", title: "CV — Elena Vasquez, MD (CORC-2202)", site: "001", person: "vasquez", effective: monthsAgo(2) });

await db.insert(s.studyMilestone).values([
  { studyId: study2Id, name: "First site activated", plannedDate: monthsAgo(2), actualDate: monthsAgo(2) },
  { studyId: study2Id, name: "First participant dosed", plannedDate: daysFromNow(30) },
]);
await db.insert(s.enrollmentReport).values({
  studySiteId: study2SiteId.get("001")!,
  asOfDate: daysAgo(7),
  screened: 5,
  enrolled: 3,
  withdrawn: 0,
  completed: 0,
  reportedBy: personId.get("kim")!,
});

// --- Read-only role for direct SQL access (docs/04-api.md) --------------------
// The v_* views are documented public surface; this role is how a data team
// reads them without the API. Dev-grade credentials, like the API tokens.
await sql`DO $$ BEGIN
  CREATE ROLE ctms_readonly LOGIN PASSWORD 'ctms_readonly';
EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
await sql`GRANT USAGE ON SCHEMA public TO ctms_readonly`;
await sql`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ctms_readonly`;

// --- Content text (ADR-0022) ---------------------------------------------------
// Seed inserts versions directly, so derive their search text the same way a
// first deployment would: the idempotent backfill.
const contentCounts = await backfillContentText(sql);
console.log(
  `content text: ${contentCounts.extracted} extracted, ${contentCounts.failed} failed`,
);

// --- Summary -----------------------------------------------------------------
const summary = await sql`
  SELECT status, count(*)::int AS n
  FROM v_expected_document_status
  GROUP BY status ORDER BY n DESC`;
console.log("expected-document status mix:");
for (const row of summary) console.log(`  ${row.status}: ${row.n}`);

const stages = await sql`
  SELECT stage, count(*)::int AS n
  FROM v_monitoring_visit_status
  GROUP BY stage ORDER BY n DESC`;
console.log("monitoring visit stage mix:");
for (const row of stages) console.log(`  ${row.stage}: ${row.n}`);

const chain = await sql`SELECT count(*)::int AS n FROM ctms_verify_audit_chain()`;
console.log(`audit chain problems: ${chain[0]!.n}`);
const events = await sql`SELECT count(*)::int AS n FROM audit_event`;
console.log(`audit events written: ${events[0]!.n}`);

await sql.end();
