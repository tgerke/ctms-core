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
]);
export const signatureMeaning = pgEnum("signature_meaning", ["author", "review", "approval"]);
export const scopeLevel = pgEnum("scope_level", ["study", "study_site", "person_role"]);

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
  },
  (t) => [uniqueIndex("document_version_number_idx").on(t.documentId, t.versionNumber)],
);

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
