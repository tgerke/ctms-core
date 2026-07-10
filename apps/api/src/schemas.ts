import { z } from "@hono/zod-openapi";

export const StudySchema = z
  .object({
    id: z.string().uuid(),
    protocol_number: z.string(),
    title: z.string(),
    phase: z.string().nullable(),
    status: z.enum(["planning", "active", "closed"]),
    sponsor_name: z.string(),
    site_count: z.number().int(),
  })
  .openapi("Study");

export const SiteCompletenessSchema = z
  .object({
    study_site_id: z.string().uuid(),
    site_number: z.string(),
    status: z.enum(["pending", "active", "closed"]),
    activated_at: z.string().nullable(),
    site_name: z.string(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    total: z.number().int(),
    current_count: z.number().int(),
    expiring_soon_count: z.number().int(),
    pending_review_count: z.number().int(),
    expired_count: z.number().int(),
    missing_count: z.number().int(),
    pct_current: z.number(),
  })
  .openapi("SiteCompleteness");

export const ExpectedStatusSchema = z
  .enum(["missing", "pending_review", "current", "expiring_soon", "expired", "superseded"])
  .openapi("ExpectedStatus");

export const ExpectedDocumentSchema = z
  .object({
    expected_document_id: z.string().uuid(),
    rule_id: z.string().uuid(),
    rule_name: z.string(),
    scope_level: z.enum(["study", "study_site", "person_role"]),
    requires_signature: z.boolean(),
    validity_months: z.number().int().nullable(),
    study_id: z.string().uuid(),
    study_site_id: z.string().uuid().nullable(),
    person_id: z.string().uuid().nullable(),
    tmf_artifact_id: z.number().int(),
    artifact_code: z.string(),
    artifact_name: z.string(),
    section_code: z.string(),
    zone_number: z.number().int(),
    zone_name: z.string(),
    document_id: z.string().uuid().nullable(),
    document_title: z.string().nullable(),
    document_status: z.string().nullable(),
    effective_date: z.string().nullable(),
    effective_expiry: z.string().nullable(),
    status: ExpectedStatusSchema,
    site_number: z.string().nullable(),
    site_name: z.string().nullable(),
    person_given_name: z.string().nullable(),
    person_family_name: z.string().nullable(),
  })
  .openapi("ExpectedDocument");

export const StaffMemberSchema = z
  .object({
    role_id: z.string().uuid(),
    role: z.string(),
    start_date: z.string(),
    end_date: z.string().nullable(),
    person_id: z.string().uuid(),
    given_name: z.string(),
    family_name: z.string(),
    credentials: z.string().nullable(),
    email: z.string(),
    open_items: z.number().int(),
  })
  .openapi("StaffMember");

export const AuditEventSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    occurred_at: z.string(),
    actor_id: z.string().uuid().nullable(),
    actor_label: z.string(),
    action: z.string(),
    entity_type: z.string(),
    entity_id: z.string().nullable(),
    before: z.record(z.any()).nullable(),
    after: z.record(z.any()).nullable(),
    prev_hash: z.string(),
    hash: z.string(),
  })
  .openapi("AuditEvent");

export const DocumentDetailSchema = z
  .object({
    document: z.record(z.any()),
    versions: z.array(z.record(z.any())),
    signatures: z.array(z.record(z.any())),
  })
  .openapi("DocumentDetail");

export const ErrorSchema = z
  .object({ error: z.string() })
  .openapi("Error");
