import {
  bigserial,
  boolean,
  char,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const orgKind = pgEnum("org_kind", ["sponsor", "cro", "site_org"]);
export const studyStatus = pgEnum("study_status", ["planning", "active", "closed"]);
export const studySiteStatus = pgEnum("study_site_status", ["pending", "active", "closed"]);
export const roleKind = pgEnum("role_kind", [
  "principal_investigator",
  "sub_investigator",
  "study_coordinator",
  "pharmacist",
  "research_nurse",
]);
export const documentStatus = pgEnum("document_status", [
  "pending_review",
  "effective",
  "superseded",
  "returned",
]);
export const signatureMeaning = pgEnum("signature_meaning", ["author", "review", "approval"]);
// System-access roles (who may call which API operations) — distinct from
// study_site_role, which records site staffing facts. See ADR-0008.
// 'ingest' is the machine-identity role for source-system filing (ADR-0011):
// read + upload only — a service can never sign or approve.
export const accessRole = pgEnum("access_role", ["admin", "trial_ops", "monitor", "read_only", "ingest"]);
// How the signer re-authenticated at signing time (§11.200). seed_fixture marks
// demo signatures fabricated by the seed, not a real signing ceremony.
export const reauthMethod = pgEnum("reauth_method", [
  "oidc_fresh_token",
  "dev_token",
  "seed_fixture",
]);
export const scopeLevel = pgEnum("scope_level", ["study", "study_site", "person_role"]);
export const visitType = pgEnum("visit_type", [
  "pre_study",
  "initiation",
  "interim",
  "close_out",
]);
export const visitDocumentLink = pgEnum("visit_document_link", [
  "trip_report",
  "confirmation_letter",
  "follow_up_letter",
]);
export const issueCategory = pgEnum("issue_category", [
  "protocol_deviation",
  "monitoring_finding",
  "safety",
  "data_quality",
  "other",
]);
export const issueSeverity = pgEnum("issue_severity", ["minor", "major", "critical"]);

// ---------------------------------------------------------------------------
// TMF Reference Model taxonomy (zones > sections > artifacts)
// Seeded as an illustrative subset of the CDISC model — see ADR-0005.
// ---------------------------------------------------------------------------

export const tmfZone = pgTable("tmf_zone", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull().unique(),
  name: text("name").notNull(),
});

export const tmfSection = pgTable(
  "tmf_section",
  {
    id: serial("id").primaryKey(),
    zoneId: integer("zone_id")
      .notNull()
      .references(() => tmfZone.id),
    code: text("code").notNull(), // e.g. "01.01"
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("tmf_section_code_idx").on(t.code)],
);

export const tmfArtifact = pgTable(
  "tmf_artifact",
  {
    id: serial("id").primaryKey(),
    sectionId: integer("section_id")
      .notNull()
      .references(() => tmfSection.id),
    code: text("code").notNull(), // e.g. "01.01.01"
    name: text("name").notNull(),
    purpose: text("purpose"),
  },
  (t) => [uniqueIndex("tmf_artifact_code_idx").on(t.code)],
);

// ---------------------------------------------------------------------------
// Organizational spine
// ---------------------------------------------------------------------------

export const organization = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: orgKind("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const study = pgTable("study", {
  id: uuid("id").primaryKey().defaultRandom(),
  protocolNumber: text("protocol_number").notNull().unique(),
  title: text("title").notNull(),
  phase: text("phase"),
  status: studyStatus("status").notNull().default("planning"),
  sponsorOrgId: uuid("sponsor_org_id")
    .notNull()
    .references(() => organization.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const protocolVersion = pgTable(
  "protocol_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => study.id),
    label: text("label").notNull(), // e.g. "v1.0", "Amendment 3"
    effectiveDate: date("effective_date").notNull(),
  },
  (t) => [uniqueIndex("protocol_version_label_idx").on(t.studyId, t.label)],
);

export const site = pgTable("site", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  city: text("city"),
  state: text("state"),
});

export const studySite = pgTable(
  "study_site",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => study.id),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id),
    siteNumber: text("site_number").notNull(),
    status: studySiteStatus("status").notNull().default("pending"),
    activatedAt: date("activated_at"),
    targetEnrollment: integer("target_enrollment"),
  },
  (t) => [
    uniqueIndex("study_site_pair_idx").on(t.studyId, t.siteId),
    uniqueIndex("study_site_number_idx").on(t.studyId, t.siteNumber),
  ],
);

export const person = pgTable("person", {
  id: uuid("id").primaryKey().defaultRandom(),
  givenName: text("given_name").notNull(),
  familyName: text("family_name").notNull(),
  email: text("email").notNull().unique(),
  credentials: text("credentials"), // display only, e.g. "MD", "RN, CCRC"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studySiteRole = pgTable(
  "study_site_role",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studySiteId: uuid("study_site_id")
      .notNull()
      .references(() => studySite.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    role: roleKind("role").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
  },
  (t) => [index("study_site_role_person_idx").on(t.personId)],
);

// System access: which person may perform which API operations, optionally
// scoped to one study or one study-site. Site vs. sponsor is a permission
// scope, not a different data model (ADR-0001). Revocation is a fact
// (revoked_at), never a delete, so grants stay reconstructable from history.
export const accessGrant = pgTable(
  "access_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    role: accessRole("role").notNull(),
    // Narrowest set scope wins: studySiteId = that site only; else studyId =
    // that study; else all studies.
    studyId: uuid("study_id").references(() => study.id),
    studySiteId: uuid("study_site_id").references(() => studySite.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("access_grant_person_idx").on(t.personId)],
);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const document = pgTable(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tmfArtifactId: integer("tmf_artifact_id")
      .notNull()
      .references(() => tmfArtifact.id),
    // Scope: study-level (both null), site-level (studySiteId set), or
    // person-level (both set). CHECK enforced in SQL migration.
    studyId: uuid("study_id")
      .notNull()
      .references(() => study.id),
    studySiteId: uuid("study_site_id").references(() => studySite.id),
    personId: uuid("person_id").references(() => person.id),
    title: text("title").notNull(),
    status: documentStatus("status").notNull().default("pending_review"),
    effectiveDate: date("effective_date"),
    expiresAt: date("expires_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_study_idx").on(t.studyId),
    index("document_site_idx").on(t.studySiteId),
    index("document_artifact_idx").on(t.tmfArtifactId),
  ],
);

export const documentVersion = pgTable(
  "document_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id),
    versionNumber: integer("version_number").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => person.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    // Filing provenance (ADR-0011): which source system filed this version and
    // its native reference (e.g. an EDC casebook id). Null for human uploads.
    sourceSystem: text("source_system"),
    sourceRef: text("source_ref"),
  },
  (t) => [uniqueIndex("document_version_number_idx").on(t.documentId, t.versionNumber)],
);

// Extracted document text (ADR-0022): derived search state keyed by the same
// content hash as the blob store. Deliberately outside the audited record —
// no audit trigger, no immutability trigger — because it can be re-derived
// from the immutable bytes at any time (pnpm db:extract-text).
export const documentContentText = pgTable("document_content_text", {
  sha256: char("sha256", { length: 64 }).primaryKey(),
  status: text("status").notNull(), // extracted | unsupported | failed (CHECK in migration 0011)
  content: text("content"),
  extractor: text("extractor"),
  charCount: integer("char_count"),
  extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const signature = pgTable("signature", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentVersionId: uuid("document_version_id")
    .notNull()
    .references(() => documentVersion.id),
  signerPersonId: uuid("signer_person_id")
    .notNull()
    .references(() => person.id),
  meaning: signatureMeaning("meaning").notNull(),
  // Copy of the version's content hash taken at signing: the §11.70
  // record<->signature binding, verifiable independently of the version row.
  signedSha256: char("signed_sha256", { length: 64 }).notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  // §11.200: how and when the signer re-authenticated at signing. Required for
  // new rows via a NOT VALID CHECK in the SQL migration (pre-existing rows are
  // exempt — the columns state the honest truth about them).
  reauthMethod: reauthMethod("reauth_method"),
  reauthAt: timestamp("reauth_at", { withTimezone: true }),
});

// Review assignment (ADR-0018): who should review a pending version, due
// when. Lifecycle is derived, never stored — an assignment is finished when
// its version gains an approval signature or a return. Reassignment inserts
// a new row (v_review_queue reads the latest); nothing is deleted.
export const reviewAssignment = pgTable(
  "review_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersion.id),
    assignedTo: uuid("assigned_to")
      .notNull()
      .references(() => person.id),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => person.id),
    dueDate: date("due_date"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_assignment_version_idx").on(t.documentVersionId),
    index("review_assignment_assignee_idx").on(t.assignedTo),
  ],
);

// Return-for-correction (ADR-0015): a reviewer sends a pending version back
// with a documented reason. Append-only like signature (immutability trigger
// in the SQL migration); the document's status carries the lifecycle state.
export const documentReturn = pgTable("document_return", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentVersionId: uuid("document_version_id")
    .notNull()
    .references(() => documentVersion.id),
  returnedBy: uuid("returned_by")
    .notNull()
    .references(() => person.id),
  reason: text("reason").notNull(),
  returnedAt: timestamp("returned_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Requirement engine
// ---------------------------------------------------------------------------

export const requirementRule = pgTable("requirement_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  studyId: uuid("study_id")
    .notNull()
    .references(() => study.id),
  tmfArtifactId: integer("tmf_artifact_id")
    .notNull()
    .references(() => tmfArtifact.id),
  scopeLevel: scopeLevel("scope_level").notNull(),
  appliesToRoles: text("applies_to_roles").array(), // null = all roles (person_role scope)
  validityMonths: integer("validity_months"), // null = never expires
  requiresSignature: boolean("requires_signature").notNull().default(false),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const expectedDocument = pgTable(
  "expected_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => requirementRule.id),
    studyId: uuid("study_id")
      .notNull()
      .references(() => study.id),
    studySiteId: uuid("study_site_id").references(() => studySite.id),
    personId: uuid("person_id").references(() => person.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // UNIQUE NULLS NOT DISTINCT (rule_id, study_site_id, person_id) added in SQL
  // migration — drizzle can't express NULLS NOT DISTINCT.
  (t) => [index("expected_document_site_idx").on(t.studySiteId)],
);

// Expected-document waiver (ADR-0016): a dated fact explaining why an
// expected document is not applicable. Lifting a waiver sets the revoke
// fields (resolve pattern, like issue.resolved_at) — never a delete; a
// partial unique index in the SQL migration allows one active waiver per
// expected document.
export const expectedDocumentWaiver = pgTable(
  "expected_document_waiver",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expectedDocumentId: uuid("expected_document_id")
      .notNull()
      .references(() => expectedDocument.id),
    waivedBy: uuid("waived_by")
      .notNull()
      .references(() => person.id),
    reason: text("reason").notNull(),
    waivedAt: timestamp("waived_at", { withTimezone: true }).notNull().defaultNow(),
    revokedBy: uuid("revoked_by").references(() => person.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
  },
  (t) => [index("expected_document_waiver_expected_idx").on(t.expectedDocumentId)],
);

// ---------------------------------------------------------------------------
// Operational layer: monitoring visits, issues, enrollment, milestones.
// Lifecycle stages are never stored — they are derived by views in the SQL
// migration (v_monitoring_visit_status, v_issue_status, v_site_enrollment,
// v_milestone_status) from the dated facts below. See ADR-0006.
// ---------------------------------------------------------------------------

export const monitoringVisit = pgTable(
  "monitoring_visit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studySiteId: uuid("study_site_id")
      .notNull()
      .references(() => studySite.id),
    visitType: visitType("visit_type").notNull(),
    scheduledDate: date("scheduled_date").notNull(),
    visitDate: date("visit_date"), // null until the visit is conducted
    monitorPersonId: uuid("monitor_person_id").references(() => person.id),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("monitoring_visit_site_idx").on(t.studySiteId)],
);

export const monitoringVisitDocument = pgTable(
  "monitoring_visit_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitoringVisitId: uuid("monitoring_visit_id")
      .notNull()
      .references(() => monitoringVisit.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id),
    linkKind: visitDocumentLink("link_kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("monitoring_visit_document_idx").on(t.monitoringVisitId, t.documentId)],
);

export const visitActionItem = pgTable(
  "visit_action_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitoringVisitId: uuid("monitoring_visit_id")
      .notNull()
      .references(() => monitoringVisit.id),
    description: text("description").notNull(),
    dueDate: date("due_date"),
    resolvedAt: date("resolved_at"),
    resolvedBy: uuid("resolved_by").references(() => person.id),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("visit_action_item_visit_idx").on(t.monitoringVisitId)],
);

export const issue = pgTable(
  "issue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => study.id),
    studySiteId: uuid("study_site_id").references(() => studySite.id), // null = study-level
    monitoringVisitId: uuid("monitoring_visit_id").references(() => monitoringVisit.id),
    category: issueCategory("category").notNull(),
    severity: issueSeverity("severity").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    identifiedDate: date("identified_date").notNull(),
    identifiedBy: uuid("identified_by").references(() => person.id),
    dueDate: date("due_date"),
    resolvedAt: date("resolved_at"),
    resolvedBy: uuid("resolved_by").references(() => person.id),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("issue_study_idx").on(t.studyId), index("issue_site_idx").on(t.studySiteId)],
);

export const enrollmentReport = pgTable(
  "enrollment_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studySiteId: uuid("study_site_id")
      .notNull()
      .references(() => studySite.id),
    asOfDate: date("as_of_date").notNull(),
    screened: integer("screened").notNull().default(0),
    enrolled: integer("enrolled").notNull().default(0),
    withdrawn: integer("withdrawn").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    reportedBy: uuid("reported_by").references(() => person.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("enrollment_report_site_date_idx").on(t.studySiteId, t.asOfDate)],
);

export const studyMilestone = pgTable(
  "study_milestone",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => study.id),
    studySiteId: uuid("study_site_id").references(() => studySite.id), // null = study-level
    name: text("name").notNull(),
    plannedDate: date("planned_date").notNull(),
    actualDate: date("actual_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // UNIQUE NULLS NOT DISTINCT (study_id, study_site_id, name) added in SQL migration.
  (t) => [index("study_milestone_study_idx").on(t.studyId)],
);

// ---------------------------------------------------------------------------
// Audit trail — rows are inserted by database triggers (see SQL migration),
// never directly by application code. Append-only, hash-chained.
// ---------------------------------------------------------------------------

export const auditEvent = pgTable(
  "audit_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(), // e.g. "document.insert"
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    prevHash: char("prev_hash", { length: 64 }).notNull(),
    hash: char("hash", { length: 64 }).notNull(),
  },
  (t) => [index("audit_event_entity_idx").on(t.entityType, t.entityId)],
);
