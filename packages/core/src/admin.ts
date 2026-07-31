import {
  accessGrant,
  expectedDocument,
  expectedDocumentWaiver,
  organization,
  person,
  requirementRule,
  site,
  study,
  studySite,
  studySiteRole,
  type Db,
} from "@ctms/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { withActor, type Actor } from "./actor.js";
import type { AccessRole } from "./authz.js";

// Study/site/staff administration (ADR-0016). These are ordinary audited rows
// — the seed script stopped being the only writer. Same withActor discipline
// as operations.ts; endings and revocations are dated facts, never deletes.

export type OrgKind = "sponsor" | "cro" | "site_org";
export type StaffRole =
  | "principal_investigator"
  | "sub_investigator"
  | "study_coordinator"
  | "pharmacist"
  | "research_nurse";
export type StudySiteStatus = "pending" | "active" | "closed";
export type RuleScopeLevel = "study" | "study_site" | "person_role";
export type StudyStatus = "planning" | "active" | "closed";

/** Lets the API map study-write failures to a status without string-matching. */
export class StudyAdminError extends Error {
  constructor(
    message: string,
    public readonly kind: "invalid" | "conflict" | "not_found",
  ) {
    super(message);
    this.name = "StudyAdminError";
  }
}

// Forward-only: a study never returns to a phase it left. planning → closed
// covers a study abandoned before activation.
const STUDY_TRANSITIONS: Record<StudyStatus, readonly StudyStatus[]> = {
  planning: ["active", "closed"],
  active: ["closed"],
  closed: [],
};

export async function createStudy(
  db: Db,
  actor: Actor,
  input: {
    protocolNumber: string;
    title: string;
    phase?: string | null;
    sponsorOrgId: string;
    /**
     * Copy this study's requirement rules verbatim (ADR-0034). The template
     * is user-authored configuration against the loaded TMF taxonomy — rules
     * are never generated (ADR-0005). Cloned in the same transaction, then
     * synced, so the new study's placeholders exist before anyone looks.
     */
    templateStudyId?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const [sponsor] = await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, input.sponsorOrgId));
    if (!sponsor) throw new StudyAdminError("sponsor organization not found", "invalid");
    if (input.templateStudyId) {
      const [template] = await tx
        .select({ id: study.id })
        .from(study)
        .where(eq(study.id, input.templateStudyId));
      if (!template) throw new StudyAdminError("template study not found", "invalid");
    }
    const [existing] = await tx
      .select({ id: study.id })
      .from(study)
      .where(eq(study.protocolNumber, input.protocolNumber));
    if (existing) {
      throw new StudyAdminError(
        `a study with protocol number ${input.protocolNumber} already exists`,
        "conflict",
      );
    }

    const rows = await tx
      .insert(study)
      .values({
        protocolNumber: input.protocolNumber,
        title: input.title,
        phase: input.phase ?? null,
        sponsorOrgId: input.sponsorOrgId,
      })
      .returning();
    const created = rows[0]!;

    let clonedRules = 0;
    if (input.templateStudyId) {
      // One insert-select; the requirement_rule audit trigger records every
      // cloned row under this transaction's actor.
      const cloned = (await tx.execute(sql`
        INSERT INTO requirement_rule
          (study_id, tmf_artifact_id, scope_level, name, description,
           applies_to_roles, validity_months, requires_signature)
        SELECT ${created.id}, rr.tmf_artifact_id, rr.scope_level, rr.name,
               rr.description, rr.applies_to_roles, rr.validity_months,
               rr.requires_signature
        FROM requirement_rule rr
        WHERE rr.study_id = ${input.templateStudyId}
        RETURNING id`)) as unknown as { id: string }[];
      clonedRules = cloned.length;
    }

    // Inside the transaction (not the pool) so the materialized placeholders'
    // audit rows keep this actor's attribution.
    const [{ synced }] = (await tx.execute(sql`
      SELECT ctms_sync_expected_documents(${created.id}) AS synced`)) as unknown as [
      { synced: number },
    ];

    return { ...created, clonedRules, expectedCreated: Number(synced) };
  });
}

// protocol_number and sponsor are the record's identity and stay immutable —
// a different protocol is a different study (the updateRequirementRule stance).
export async function updateStudy(
  db: Db,
  actor: Actor,
  input: {
    studyId: string;
    title?: string;
    phase?: string | null;
    status?: StudyStatus;
  },
) {
  return withActor(db, actor, async (tx) => {
    const [current] = await tx
      .select({ status: study.status })
      .from(study)
      .where(eq(study.id, input.studyId));
    if (!current) throw new StudyAdminError("study not found", "not_found");
    if (input.status !== undefined && input.status !== current.status) {
      if (!STUDY_TRANSITIONS[current.status].includes(input.status)) {
        throw new StudyAdminError(
          `a ${current.status} study cannot move to ${input.status}`,
          "invalid",
        );
      }
    }
    const rows = await tx
      .update(study)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.phase !== undefined ? { phase: input.phase } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .where(eq(study.id, input.studyId))
      .returning();
    return rows[0]!;
  });
}

export async function createOrganization(
  db: Db,
  actor: Actor,
  input: { name: string; kind: OrgKind },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(organization)
      .values({ name: input.name, kind: input.kind })
      .returning();
    return rows[0]!;
  });
}

export async function createSite(
  db: Db,
  actor: Actor,
  input: {
    organizationId: string;
    name: string;
    city?: string | null;
    state?: string | null;
    /** ISO 3166-1 alpha-3 — the eTMF-EMS <COUNTRYID> for the site's documents (ADR-0024). */
    country?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(site)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? null,
      })
      .returning();
    return rows[0]!;
  });
}

export async function createPerson(
  db: Db,
  actor: Actor,
  input: { givenName: string; familyName: string; email: string; credentials?: string | null },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(person)
      .values({
        givenName: input.givenName,
        familyName: input.familyName,
        email: input.email,
        credentials: input.credentials ?? null,
      })
      .returning();
    return rows[0]!;
  });
}

export async function addStudySite(
  db: Db,
  actor: Actor,
  input: { studyId: string; siteId: string; siteNumber: string; targetEnrollment?: number | null },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(studySite)
      .values({
        studyId: input.studyId,
        siteId: input.siteId,
        siteNumber: input.siteNumber,
        targetEnrollment: input.targetEnrollment ?? null,
      })
      .returning();
    return rows[0]!;
  });
}

export async function updateStudySite(
  db: Db,
  actor: Actor,
  input: {
    studySiteId: string;
    status?: StudySiteStatus;
    activatedAt?: string | null;
    targetEnrollment?: number | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(studySite)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.activatedAt !== undefined ? { activatedAt: input.activatedAt } : {}),
        ...(input.targetEnrollment !== undefined
          ? { targetEnrollment: input.targetEnrollment }
          : {}),
      })
      .where(eq(studySite.id, input.studySiteId))
      .returning();
    if (!rows[0]) throw new Error("study site not found");
    return rows[0];
  });
}

export async function assignSiteRole(
  db: Db,
  actor: Actor,
  input: { studySiteId: string; personId: string; role: StaffRole; startDate: string },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(studySiteRole)
      .values({
        studySiteId: input.studySiteId,
        personId: input.personId,
        role: input.role,
        startDate: input.startDate,
      })
      .returning();
    return rows[0]!;
  });
}

export async function endSiteRole(
  db: Db,
  actor: Actor,
  input: { roleId: string; endDate: string },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(studySiteRole)
      .set({ endDate: input.endDate })
      .where(eq(studySiteRole.id, input.roleId))
      .returning();
    if (!rows[0]) throw new Error("study site role not found");
    return rows[0];
  });
}

export async function grantAccess(
  db: Db,
  actor: Actor,
  input: {
    personId: string;
    role: AccessRole;
    studyId?: string | null;
    studySiteId?: string | null;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(accessGrant)
      .values({
        personId: input.personId,
        role: input.role,
        studyId: input.studyId ?? null,
        studySiteId: input.studySiteId ?? null,
      })
      .returning();
    return rows[0]!;
  });
}

export async function revokeAccess(db: Db, actor: Actor, input: { grantId: string }) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(accessGrant)
      .set({ revokedAt: new Date() })
      .where(and(eq(accessGrant.id, input.grantId), isNull(accessGrant.revokedAt)))
      .returning();
    if (!rows[0]) throw new Error("grant not found or already revoked");
    return rows[0];
  });
}

export async function createRequirementRule(
  db: Db,
  actor: Actor,
  input: {
    studyId: string;
    tmfArtifactId: number;
    scopeLevel: RuleScopeLevel;
    name: string;
    description?: string | null;
    appliesToRoles?: string[] | null;
    validityMonths?: number | null;
    requiresSignature?: boolean;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .insert(requirementRule)
      .values({
        studyId: input.studyId,
        tmfArtifactId: input.tmfArtifactId,
        scopeLevel: input.scopeLevel,
        name: input.name,
        description: input.description ?? null,
        appliesToRoles: input.appliesToRoles ?? null,
        validityMonths: input.validityMonths ?? null,
        requiresSignature: input.requiresSignature ?? false,
      })
      .returning();
    return rows[0]!;
  });
}

// scope_level and artifact are fixed after creation: changing what a rule
// *is* means a new rule (expected documents already materialized from the
// old shape would silently orphan otherwise).
export async function updateRequirementRule(
  db: Db,
  actor: Actor,
  input: {
    ruleId: string;
    name?: string;
    description?: string | null;
    appliesToRoles?: string[] | null;
    validityMonths?: number | null;
    requiresSignature?: boolean;
  },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(requirementRule)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.appliesToRoles !== undefined ? { appliesToRoles: input.appliesToRoles } : {}),
        ...(input.validityMonths !== undefined ? { validityMonths: input.validityMonths } : {}),
        ...(input.requiresSignature !== undefined
          ? { requiresSignature: input.requiresSignature }
          : {}),
      })
      .where(eq(requirementRule.id, input.ruleId))
      .returning();
    if (!rows[0]) throw new Error("requirement rule not found");
    return rows[0];
  });
}

export async function waiveExpectedDocument(
  db: Db,
  actor: Actor,
  input: { expectedDocumentId: string; waivedByPersonId: string; reason: string },
) {
  return withActor(db, actor, async (tx) => {
    const expected = await tx
      .select({ id: expectedDocument.id })
      .from(expectedDocument)
      .where(eq(expectedDocument.id, input.expectedDocumentId));
    if (!expected[0]) throw new Error("expected document not found");
    const active = await tx
      .select({ id: expectedDocumentWaiver.id })
      .from(expectedDocumentWaiver)
      .where(
        and(
          eq(expectedDocumentWaiver.expectedDocumentId, input.expectedDocumentId),
          isNull(expectedDocumentWaiver.revokedAt),
        ),
      );
    if (active[0]) throw new Error("an active waiver already exists for this expected document");
    const rows = await tx
      .insert(expectedDocumentWaiver)
      .values({
        expectedDocumentId: input.expectedDocumentId,
        waivedBy: input.waivedByPersonId,
        reason: input.reason,
      })
      .returning();
    return rows[0]!;
  });
}

export async function revokeWaiver(
  db: Db,
  actor: Actor,
  input: { expectedDocumentId: string; revokedByPersonId: string; reason: string },
) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx
      .update(expectedDocumentWaiver)
      .set({
        revokedBy: input.revokedByPersonId,
        revokedAt: new Date(),
        revokeReason: input.reason,
      })
      .where(
        and(
          eq(expectedDocumentWaiver.expectedDocumentId, input.expectedDocumentId),
          isNull(expectedDocumentWaiver.revokedAt),
        ),
      )
      .returning();
    if (!rows[0]) throw new Error("no active waiver for this expected document");
    return rows[0];
  });
}
