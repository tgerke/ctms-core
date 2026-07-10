import type { Sql } from "@ctms/db";

/**
 * Role-based authorization over access_grant rows (ADR-0008). Roles map to
 * operations here, in one place; scope narrowing (study, study-site) comes
 * from the grant row. Site vs. sponsor is a permission scope, not a different
 * data model (ADR-0001).
 */

export type Operation = "read" | "upload" | "sign" | "approve" | "administer";
export type AccessRole = "admin" | "trial_ops" | "monitor" | "read_only" | "ingest";

const ROLE_OPERATIONS: Record<AccessRole, readonly Operation[]> = {
  admin: ["read", "upload", "sign", "approve", "administer"],
  trial_ops: ["read", "upload", "sign", "approve"],
  monitor: ["read", "upload", "sign"],
  read_only: ["read"],
  // Machine identities filing from source systems (ADR-0011): a service can
  // read and upload but never sign — signatures need a human ceremony.
  ingest: ["read", "upload"],
};

export interface Grant {
  role: AccessRole;
  study_id: string | null;
  study_site_id: string | null;
}

/** The study/site a request touches; empty = not scoped to one resource. */
export interface ResourceScope {
  studyId?: string;
  studySiteId?: string;
}

/** Active (non-revoked) grants for a person. */
export async function grantsFor(sql: Sql, personId: string): Promise<Grant[]> {
  return (await sql`
    SELECT role, study_id, study_site_id FROM access_grant
    WHERE person_id = ${personId} AND revoked_at IS NULL`) as unknown as Grant[];
}

/**
 * Does any grant permit `op` on `scope`? A grant's narrowest set scope wins:
 * a site-scoped grant matches only that site; a study-scoped grant matches
 * any resource of that study; an unscoped grant matches everything. A scope
 * with no ids (e.g. the study list) is matched by any grant whose role
 * permits the operation.
 */
export function permits(grants: Grant[], op: Operation, scope: ResourceScope): boolean {
  const unscoped = !scope.studyId && !scope.studySiteId;
  return grants.some((g) => {
    if (!ROLE_OPERATIONS[g.role].includes(op)) return false;
    if (unscoped) return true;
    if (g.study_site_id) return scope.studySiteId === g.study_site_id;
    if (g.study_id) return scope.studyId === g.study_id;
    return true;
  });
}

/** Param names the API uses to reference scoped resources. */
export type ScopeParam =
  | "studyId"
  | "studySiteId"
  | "documentId"
  | "versionId"
  | "visitId"
  | "actionItemId"
  | "issueId"
  | "milestoneId";

/**
 * Resolve a path parameter to the study/site it belongs to (one indexed
 * lookup). Returns null when the id doesn't exist — the route handler owns
 * the 404; authorization then falls back to unscoped matching.
 */
export async function resolveScope(
  sql: Sql,
  param: ScopeParam,
  id: string,
): Promise<ResourceScope | null> {
  switch (param) {
    case "studyId":
      return { studyId: id };
    case "studySiteId": {
      const [r] = await sql`SELECT study_id FROM study_site WHERE id = ${id}`;
      return r ? { studyId: r.study_id, studySiteId: id } : null;
    }
    case "documentId": {
      const [r] = await sql`
        SELECT study_id, study_site_id FROM document WHERE id = ${id}`;
      return r
        ? { studyId: r.study_id, studySiteId: r.study_site_id ?? undefined }
        : null;
    }
    case "versionId": {
      const [r] = await sql`
        SELECT d.study_id, d.study_site_id FROM document_version dv
        JOIN document d ON d.id = dv.document_id WHERE dv.id = ${id}`;
      return r
        ? { studyId: r.study_id, studySiteId: r.study_site_id ?? undefined }
        : null;
    }
    case "visitId": {
      const [r] = await sql`
        SELECT ss.study_id, mv.study_site_id FROM monitoring_visit mv
        JOIN study_site ss ON ss.id = mv.study_site_id WHERE mv.id = ${id}`;
      return r ? { studyId: r.study_id, studySiteId: r.study_site_id } : null;
    }
    case "actionItemId": {
      const [r] = await sql`
        SELECT ss.study_id, mv.study_site_id FROM visit_action_item ai
        JOIN monitoring_visit mv ON mv.id = ai.monitoring_visit_id
        JOIN study_site ss ON ss.id = mv.study_site_id WHERE ai.id = ${id}`;
      return r ? { studyId: r.study_id, studySiteId: r.study_site_id } : null;
    }
    case "issueId": {
      const [r] = await sql`
        SELECT study_id, study_site_id FROM issue WHERE id = ${id}`;
      return r
        ? { studyId: r.study_id, studySiteId: r.study_site_id ?? undefined }
        : null;
    }
    case "milestoneId": {
      const [r] = await sql`
        SELECT study_id, study_site_id FROM study_milestone WHERE id = ${id}`;
      return r
        ? { studyId: r.study_id, studySiteId: r.study_site_id ?? undefined }
        : null;
    }
  }
}
