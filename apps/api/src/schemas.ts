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
    returned_count: z.number().int(),
    expired_count: z.number().int(),
    missing_count: z.number().int(),
    waived_count: z.number().int(),
    pct_current: z.number(),
  })
  .openapi("SiteCompleteness");

export const ExpectedStatusSchema = z
  .enum([
    "missing",
    "pending_review",
    "returned",
    "current",
    "expiring_soon",
    "expired",
    "superseded",
    "waived",
  ])
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
    waiver_id: z.string().uuid().nullable(),
    waiver_reason: z.string().nullable(),
    waived_at: z.string().nullable(),
    waived_by: z.string().uuid().nullable(),
    waived_by_given_name: z.string().nullable(),
    waived_by_family_name: z.string().nullable(),
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
    returns: z.array(z.record(z.any())),
    assignments: z.array(z.record(z.any())),
  })
  .openapi("DocumentDetail");

// --- Document search (ADR-0019) --------------------------------------------------

export const SearchResultSchema = z
  .object({
    study_id: z.string().uuid(),
    document_id: z.string().uuid(),
    title: z.string(),
    status: z.string(),
    effective_date: z.string().nullable(),
    expires_at: z.string().nullable(),
    created_at: z.string(),
    artifact_code: z.string(),
    artifact_name: z.string(),
    section_name: z.string(),
    zone_number: z.number().int(),
    zone_name: z.string(),
    study_site_id: z.string().uuid().nullable(),
    site_number: z.string().nullable(),
    site_name: z.string().nullable(),
    person_id: z.string().uuid().nullable(),
    person_given_name: z.string().nullable(),
    person_family_name: z.string().nullable(),
    version_count: z.number().int(),
    latest_version_id: z.string().uuid(),
    latest_uploaded_at: z.string(),
    uploader_given_name: z.string().nullable(),
    uploader_family_name: z.string().nullable(),
    haystack: z.string(),
  })
  .openapi("SearchResult");

// --- Review queue (ADR-0018) ---------------------------------------------------

export const QueueStatusSchema = z
  .enum(["unassigned", "assigned", "overdue"])
  .openapi("QueueStatus");

export const QueueEntrySchema = z
  .object({
    study_id: z.string().uuid(),
    document_id: z.string().uuid(),
    document_version_id: z.string().uuid(),
    version_number: z.number().int(),
    title: z.string(),
    study_site_id: z.string().uuid().nullable(),
    site_number: z.string().nullable(),
    site_name: z.string().nullable(),
    artifact_code: z.string(),
    artifact_name: z.string(),
    uploaded_at: z.string(),
    uploader_given_name: z.string().nullable(),
    uploader_family_name: z.string().nullable(),
    assignment_id: z.string().uuid().nullable(),
    assigned_to: z.string().uuid().nullable(),
    assignee_given_name: z.string().nullable(),
    assignee_family_name: z.string().nullable(),
    assigned_by: z.string().uuid().nullable(),
    assigner_given_name: z.string().nullable(),
    assigner_family_name: z.string().nullable(),
    due_date: z.string().nullable(),
    assigned_at: z.string().nullable(),
    note: z.string().nullable(),
    queue_status: QueueStatusSchema,
  })
  .openapi("QueueEntry");

export const ErrorSchema = z
  .object({ error: z.string() })
  .openapi("Error");

// --- Administration (ADR-0016) -------------------------------------------------

export const OrgKindSchema = z.enum(["sponsor", "cro", "site_org"]).openapi("OrgKind");

export const StaffRoleSchema = z
  .enum([
    "principal_investigator",
    "sub_investigator",
    "study_coordinator",
    "pharmacist",
    "research_nurse",
  ])
  .openapi("StaffRole");

export const AccessRoleSchema = z
  .enum(["admin", "trial_ops", "monitor", "read_only", "ingest"])
  .openapi("AccessRole");

export const OrganizationSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    kind: OrgKindSchema,
    site_count: z.number().int(),
  })
  .openapi("Organization");

export const SiteDirectorySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    organization_id: z.string().uuid(),
    organization_name: z.string(),
  })
  .openapi("SiteDirectory");

export const PersonSchema = z
  .object({
    id: z.string().uuid(),
    given_name: z.string(),
    family_name: z.string(),
    email: z.string(),
    credentials: z.string().nullable(),
    grants: z.array(
      z.object({
        grant_id: z.string().uuid(),
        role: AccessRoleSchema,
        study_id: z.string().uuid().nullable(),
        study_site_id: z.string().uuid().nullable(),
        granted_at: z.string(),
      }),
    ),
  })
  .openapi("Person");

export const RequirementRuleSchema = z
  .object({
    id: z.string().uuid(),
    study_id: z.string().uuid(),
    tmf_artifact_id: z.number().int(),
    artifact_code: z.string(),
    artifact_name: z.string(),
    scope_level: z.enum(["study", "study_site", "person_role"]),
    applies_to_roles: z.array(z.string()).nullable(),
    validity_months: z.number().int().nullable(),
    requires_signature: z.boolean(),
    name: z.string(),
    description: z.string().nullable(),
    expected_count: z.number().int(),
  })
  .openapi("RequirementRule");

export const TmfArtifactSchema = z
  .object({
    id: z.number().int(),
    code: z.string(),
    name: z.string(),
    section_name: z.string(),
    zone_name: z.string(),
  })
  .openapi("TmfArtifact");

// --- Operational layer -------------------------------------------------------

export const VisitTypeSchema = z
  .enum(["pre_study", "initiation", "interim", "close_out"])
  .openapi("VisitType");

export const VisitStageSchema = z
  .enum([
    "scheduled",
    "overdue",
    "awaiting_report",
    "report_pending_review",
    "follow_up",
    "complete",
  ])
  .openapi("VisitStage");

export const VisitDocumentLinkSchema = z
  .enum(["trip_report", "confirmation_letter", "follow_up_letter"])
  .openapi("VisitDocumentLink");

export const MonitoringVisitSchema = z
  .object({
    monitoring_visit_id: z.string().uuid(),
    study_id: z.string().uuid(),
    study_site_id: z.string().uuid(),
    site_number: z.string(),
    site_name: z.string(),
    visit_type: VisitTypeSchema,
    scheduled_date: z.string(),
    visit_date: z.string().nullable(),
    monitor_person_id: z.string().uuid().nullable(),
    monitor_given_name: z.string().nullable(),
    monitor_family_name: z.string().nullable(),
    summary: z.string().nullable(),
    trip_report_document_id: z.string().uuid().nullable(),
    trip_report_status: z.string().nullable(),
    open_action_items: z.number().int(),
    total_action_items: z.number().int(),
    stage: VisitStageSchema,
  })
  .openapi("MonitoringVisit");

export const ActionItemSchema = z
  .object({
    id: z.string().uuid(),
    monitoring_visit_id: z.string().uuid(),
    description: z.string(),
    due_date: z.string().nullable(),
    resolved_at: z.string().nullable(),
    resolved_by: z.string().uuid().nullable(),
    resolved_by_given_name: z.string().nullable(),
    resolved_by_family_name: z.string().nullable(),
    resolution_note: z.string().nullable(),
    created_at: z.string(),
    status: z.enum(["open", "overdue", "resolved"]),
  })
  .openapi("ActionItem");

export const IssueCategorySchema = z
  .enum(["protocol_deviation", "monitoring_finding", "safety", "data_quality", "other"])
  .openapi("IssueCategory");

export const IssueSeveritySchema = z.enum(["minor", "major", "critical"]).openapi("IssueSeverity");

export const IssueStatusSchema = z.enum(["open", "overdue", "resolved"]).openapi("IssueStatus");

export const IssueSchema = z
  .object({
    id: z.string().uuid(),
    study_id: z.string().uuid(),
    study_site_id: z.string().uuid().nullable(),
    monitoring_visit_id: z.string().uuid().nullable(),
    site_number: z.string().nullable(),
    site_name: z.string().nullable(),
    category: IssueCategorySchema,
    severity: IssueSeveritySchema,
    title: z.string(),
    description: z.string().nullable(),
    identified_date: z.string(),
    identified_by: z.string().uuid().nullable(),
    identified_by_given_name: z.string().nullable().optional(),
    identified_by_family_name: z.string().nullable().optional(),
    due_date: z.string().nullable(),
    resolved_at: z.string().nullable(),
    resolved_by: z.string().uuid().nullable(),
    resolution_note: z.string().nullable(),
    created_at: z.string(),
    status: IssueStatusSchema,
  })
  .openapi("Issue");

export const SiteEnrollmentSchema = z
  .object({
    study_id: z.string().uuid(),
    study_site_id: z.string().uuid(),
    site_number: z.string(),
    site_name: z.string(),
    target_enrollment: z.number().int().nullable(),
    as_of_date: z.string().nullable(),
    screened: z.number().int().nullable(),
    enrolled: z.number().int().nullable(),
    withdrawn: z.number().int().nullable(),
    completed: z.number().int().nullable(),
    pct_of_target: z.union([z.number(), z.string()]).nullable(),
  })
  .openapi("SiteEnrollment");

export const MilestoneSchema = z
  .object({
    id: z.string().uuid(),
    study_id: z.string().uuid(),
    study_site_id: z.string().uuid().nullable(),
    site_number: z.string().nullable(),
    name: z.string(),
    planned_date: z.string(),
    actual_date: z.string().nullable(),
    created_at: z.string(),
    status: z.enum(["achieved", "overdue", "upcoming"]),
  })
  .openapi("Milestone");

export const VisitDetailSchema = z
  .object({
    visit: MonitoringVisitSchema,
    documents: z.array(
      z.object({
        link_kind: VisitDocumentLinkSchema,
        document_id: z.string().uuid(),
        title: z.string(),
        status: z.string(),
        effective_date: z.string().nullable(),
      }),
    ),
    actionItems: z.array(ActionItemSchema),
    issues: z.array(IssueSchema),
  })
  .openapi("VisitDetail");
