/**
 * Dev seed: one fictional multi-site prostate-cancer trial with a realistic
 * mix of current, expiring, pending, expired, and missing documents so the
 * completeness views tell a story on first run. Destructive: truncates all
 * tables (dev affordance only; production roles would not hold TRUNCATE).
 */
import { createDb } from "../client.js";
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

// Attribute all seed writes in the audit trail.
await sql`SELECT set_config('ctms.actor_label', 'seed', false)`;

await sql`TRUNCATE audit_event, signature, document_version, expected_document,
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
}
const siteSpecs: SiteSpec[] = [
  { number: "001", org: "University Medical Center", name: "University Medical Center", city: "Portland", state: "OR", status: "active", activated: monthsAgo(8) },
  { number: "002", org: "Lakeside Cancer Institute", name: "Lakeside Cancer Institute", city: "Chicago", state: "IL", status: "active", activated: monthsAgo(7) },
  { number: "003", org: "Harbor View Regional Hospital", name: "Harbor View Regional Hospital", city: "Charleston", state: "SC", status: "active", activated: monthsAgo(5) },
  { number: "004", org: "Prairie Regional Medical Center", name: "Prairie Regional Medical Center", city: "Fargo", state: "ND", status: "pending", activated: null },
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
  status?: "pending_review" | "effective" | "superseded";
  effective?: string;
  uploadedBy?: string;
  versions?: string[]; // version labels; default one
  sign?: { by: string; meaning: "author" | "review" | "approval" };
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
      effectiveDate: status === "pending_review" ? null : (spec.effective ?? null),
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
    const { sha256, sizeBytes } = putBlob(pdf);
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
  if (spec.sign) {
    const [version] = await sql<[{ id: string }]>`
      SELECT id FROM document_version WHERE document_id = ${doc!.id}
      ORDER BY version_number DESC LIMIT 1`;
    await db.insert(s.signature).values({
      documentVersionId: version!.id,
      signerPersonId: personId.get(spec.sign.by)!,
      meaning: spec.sign.meaning,
      signedSha256: lastSha,
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
await addDoc({ artifact: "04.01.02", title: "IRB Continuing Review Approval — Site 002", site: "002", status: "pending_review", uploadedBy: "oduya" });
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

// --- Site 003 (missing DoA log + lab accreditation; Cole license expiring)
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
await addDoc({ artifact: "05.02.03", title: "GCP Certificate — Torres", site: "003", person: "torres", effective: monthsAgo(6) });

// --- Site 004 (pending activation: mostly missing, startup docs trickling in)
await addDoc({ artifact: "05.01.04", title: "Clinical Trial Agreement — Site 004", site: "004", effective: daysAgo(20) });
await addDoc({ artifact: "04.01.02", title: "IRB Approval — Site 004", site: "004", effective: daysAgo(10) });
await addDoc({ artifact: "05.02.01", title: "CV — Olaf Bergstrom, MD", site: "004", person: "bergstrom", effective: daysAgo(15) });

// --- Summary -----------------------------------------------------------------
const summary = await sql`
  SELECT status, count(*)::int AS n
  FROM v_expected_document_status
  GROUP BY status ORDER BY n DESC`;
console.log("expected-document status mix:");
for (const row of summary) console.log(`  ${row.status}: ${row.n}`);

const chain = await sql`SELECT count(*)::int AS n FROM ctms_verify_audit_chain()`;
console.log(`audit chain problems: ${chain[0]!.n}`);
const events = await sql`SELECT count(*)::int AS n FROM audit_event`;
console.log(`audit events written: ${events[0]!.n}`);

await sql.end();
