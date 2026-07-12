import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authMode, beginLogin, getReauthToken, token } from "./auth";

export type ExpectedStatus =
  | "missing"
  | "pending_review"
  | "returned"
  | "current"
  | "expiring_soon"
  | "expired"
  | "superseded"
  | "waived";

export interface Study {
  id: string;
  protocol_number: string;
  title: string;
  phase: string | null;
  status: string;
  sponsor_name: string;
  site_count: number;
}

export interface SiteCompleteness {
  study_site_id: string;
  site_number: string;
  status: "pending" | "active" | "closed";
  activated_at: string | null;
  site_name: string;
  city: string | null;
  state: string | null;
  total: number;
  current_count: number;
  expiring_soon_count: number;
  pending_review_count: number;
  returned_count: number;
  expired_count: number;
  missing_count: number;
  waived_count: number;
  pct_current: number;
}

export interface ExpectedDocument {
  expected_document_id: string;
  rule_id: string;
  rule_name: string;
  scope_level: "study" | "study_site" | "person_role";
  requires_signature: boolean;
  validity_months: number | null;
  study_id: string;
  study_site_id: string | null;
  person_id: string | null;
  tmf_artifact_id: number;
  artifact_code: string;
  artifact_name: string;
  section_code: string;
  zone_number: number;
  zone_name: string;
  document_id: string | null;
  document_title: string | null;
  document_status: string | null;
  effective_date: string | null;
  effective_expiry: string | null;
  waiver_id: string | null;
  waiver_reason: string | null;
  waived_at: string | null;
  waived_by: string | null;
  waived_by_given_name: string | null;
  waived_by_family_name: string | null;
  status: ExpectedStatus;
  site_number: string | null;
  site_name: string | null;
  person_given_name: string | null;
  person_family_name: string | null;
}

export interface StaffMember {
  role_id: string;
  role: string;
  start_date: string;
  end_date: string | null;
  person_id: string;
  given_name: string;
  family_name: string;
  credentials: string | null;
  email: string;
  open_items: number;
}

export interface AuditEvent {
  id: number | string;
  occurred_at: string;
  actor_id: string | null;
  actor_label: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  prev_hash: string;
  hash: string;
  actor_given_name?: string | null;
  actor_family_name?: string | null;
}

export interface DocumentDetail {
  document: Record<string, any>;
  versions: Record<string, any>[];
  signatures: Record<string, any>[];
  returns: Record<string, any>[];
  assignments: Record<string, any>[];
}

// --- Portfolio (ADR-0021) ------------------------------------------------------

export interface PortfolioEntry {
  id: string;
  protocol_number: string;
  title: string;
  phase: string | null;
  status: string;
  sponsor_name: string;
  site_count: number;
  active_site_count: number;
  expected_total: number;
  current_count: number;
  missing_count: number;
  attention_count: number;
  pending_review_count: number;
  waived_count: number;
  pct_current: number | string;
  open_issues: number;
  overdue_visits: number;
  review_queue: number;
  enrolled: number;
  target_enrollment: number;
}

// --- Document search (ADR-0019) ----------------------------------------------

export interface SearchResult {
  study_id: string;
  document_id: string;
  title: string;
  status: string;
  effective_date: string | null;
  expires_at: string | null;
  created_at: string;
  artifact_code: string;
  artifact_name: string;
  section_name: string;
  zone_number: number;
  zone_name: string;
  study_site_id: string | null;
  site_number: string | null;
  site_name: string | null;
  person_id: string | null;
  person_given_name: string | null;
  person_family_name: string | null;
  version_count: number;
  latest_version_id: string;
  latest_uploaded_at: string;
  uploader_given_name: string | null;
  uploader_family_name: string | null;
  // Content full-text (ADR-0022): did the extracted document text match, and
  // the text around that match.
  matched_in_content: boolean;
  content_snippet: string | null;
}

// --- Review queue (ADR-0018) -------------------------------------------------

export type QueueStatus = "unassigned" | "assigned" | "overdue";

export interface QueueEntry {
  study_id: string;
  document_id: string;
  document_version_id: string;
  version_number: number;
  title: string;
  study_site_id: string | null;
  site_number: string | null;
  site_name: string | null;
  artifact_code: string;
  artifact_name: string;
  uploaded_at: string;
  uploader_given_name: string | null;
  uploader_family_name: string | null;
  assignment_id: string | null;
  assigned_to: string | null;
  assignee_given_name: string | null;
  assignee_family_name: string | null;
  assigned_by: string | null;
  assigner_given_name: string | null;
  assigner_family_name: string | null;
  due_date: string | null;
  assigned_at: string | null;
  note: string | null;
  queue_status: QueueStatus;
}

// --- Operational layer --------------------------------------------------------

export type VisitStage =
  | "scheduled"
  | "overdue"
  | "awaiting_report"
  | "report_pending_review"
  | "follow_up"
  | "complete";

export type VisitType = "pre_study" | "initiation" | "interim" | "close_out";

export interface MonitoringVisit {
  monitoring_visit_id: string;
  study_id: string;
  study_site_id: string;
  site_number: string;
  site_name: string;
  visit_type: VisitType;
  scheduled_date: string;
  visit_date: string | null;
  monitor_person_id: string | null;
  monitor_given_name: string | null;
  monitor_family_name: string | null;
  summary: string | null;
  trip_report_document_id: string | null;
  trip_report_status: string | null;
  open_action_items: number;
  total_action_items: number;
  stage: VisitStage;
}

export interface ActionItem {
  id: string;
  monitoring_visit_id: string;
  description: string;
  due_date: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_given_name: string | null;
  resolved_by_family_name: string | null;
  resolution_note: string | null;
  created_at: string;
  status: "open" | "overdue" | "resolved";
}

export type IssueCategory =
  | "protocol_deviation"
  | "monitoring_finding"
  | "safety"
  | "data_quality"
  | "other";
export type IssueSeverity = "minor" | "major" | "critical";
export type IssueStatus = "open" | "overdue" | "resolved";

export interface Issue {
  id: string;
  study_id: string;
  study_site_id: string | null;
  monitoring_visit_id: string | null;
  site_number: string | null;
  site_name: string | null;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string | null;
  identified_date: string;
  identified_by: string | null;
  identified_by_given_name?: string | null;
  identified_by_family_name?: string | null;
  due_date: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  status: IssueStatus;
}

export interface SiteEnrollment {
  study_id: string;
  study_site_id: string;
  site_number: string;
  site_name: string;
  target_enrollment: number | null;
  as_of_date: string | null;
  screened: number | null;
  enrolled: number | null;
  withdrawn: number | null;
  completed: number | null;
  pct_of_target: number | string | null;
}

export interface Milestone {
  id: string;
  study_id: string;
  study_site_id: string | null;
  site_number: string | null;
  name: string;
  planned_date: string;
  actual_date: string | null;
  created_at: string;
  status: "achieved" | "overdue" | "upcoming";
}

export interface VisitDetail {
  visit: MonitoringVisit;
  documents: {
    link_kind: "trip_report" | "confirmation_letter" | "follow_up_letter";
    document_id: string;
    title: string;
    status: string;
    effective_date: string | null;
  }[];
  actionItems: ActionItem[];
  issues: Issue[];
}

// --- Administration (ADR-0016) ---------------------------------------------

export type OrgKind = "sponsor" | "cro" | "site_org";
export type StaffRole =
  | "principal_investigator"
  | "sub_investigator"
  | "study_coordinator"
  | "pharmacist"
  | "research_nurse";
export type AccessRole =
  | "admin"
  | "trial_ops"
  | "monitor"
  | "read_only"
  | "ingest"
  | "site_staff";

export interface Organization {
  id: string;
  name: string;
  kind: OrgKind;
  site_count: number;
}

export interface SiteDirectoryEntry {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  organization_id: string;
  organization_name: string;
}

export interface Person {
  id: string;
  given_name: string;
  family_name: string;
  email: string;
  credentials: string | null;
  grants: {
    grant_id: string;
    role: AccessRole;
    study_id: string | null;
    study_site_id: string | null;
    granted_at: string;
  }[];
}

export interface RequirementRule {
  id: string;
  study_id: string;
  tmf_artifact_id: number;
  artifact_code: string;
  artifact_name: string;
  scope_level: "study" | "study_site" | "person_role";
  applies_to_roles: string[] | null;
  validity_months: number | null;
  requires_signature: boolean;
  name: string;
  description: string | null;
  expected_count: number;
}

export interface TmfArtifact {
  id: number;
  code: string;
  name: string;
  section_name: string;
  zone_name: string;
}

// --- Site seat (ADR-0023) ----------------------------------------------------

export interface Me {
  person_id: string;
  given_name: string;
  family_name: string;
  grants: {
    role: AccessRole;
    study_id: string | null;
    study_site_id: string | null;
  }[];
}

export interface SiteOverview {
  study_site_id: string;
  study_id: string;
  site_number: string;
  status: "pending" | "active" | "closed";
  activated_at: string | null;
  target_enrollment: number | null;
  site_name: string;
  city: string | null;
  state: string | null;
  protocol_number: string;
  study_title: string;
  total: number;
  current_count: number;
  expiring_soon_count: number;
  pending_review_count: number;
  returned_count: number;
  expired_count: number;
  missing_count: number;
  waived_count: number;
  pct_current: number;
}

export interface Delegation {
  delegation_id: string;
  study_id: string;
  study_site_id: string;
  site_number: string;
  site_name: string;
  person_id: string;
  given_name: string;
  family_name: string;
  credentials: string | null;
  delegated_tasks: string[];
  start_date: string;
  end_date: string | null;
  authorized_by: string;
  authorizer_given_name: string;
  authorizer_family_name: string;
  authorizer_was_pi: boolean;
  credential_open_items: number;
  status: "active" | "ended";
}

export interface TrainingRecord {
  training_record_id: string;
  study_id: string;
  study_site_id: string;
  site_number: string;
  site_name: string;
  person_id: string;
  given_name: string;
  family_name: string;
  credentials: string | null;
  topic: string;
  trained_on: string;
  expires_at: string | null;
  document_id: string | null;
  document_status: string | null;
  status: "current" | "expiring_soon" | "expired";
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`API ${status}: ${detail}`);
  }
}

/** Plain-language rendering of any error surfaced in the UI. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "You're not signed in — refresh the page to sign in again.";
    if (e.status === 403) return "You don't have permission to do this.";
    if (e.status < 500 && e.detail) return e.detail;
    return "Something went wrong on the server — please try again.";
  }
  if (e instanceof TypeError)
    return "Couldn't reach the server — check your connection and try again.";
  return "Something went wrong — please try again.";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token() ?? ""}`,
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 && authMode === "oidc") {
    await beginLogin(); // session expired: round-trip through the IdP
  }
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.error === "string") detail = parsed.error;
    } catch {
      // non-JSON body: keep the raw text as detail
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const fileUrl = (sha256: string) => `/api/files/${sha256}`;

export const useStudies = () =>
  useQuery({ queryKey: ["studies"], queryFn: () => api<Study[]>("/studies") });

export const useSites = (studyId: string | undefined) =>
  useQuery({
    queryKey: ["sites", studyId],
    queryFn: () => api<SiteCompleteness[]>(`/studies/${studyId}/sites`),
    enabled: !!studyId,
  });

export const useExpected = (
  studyId: string | undefined,
  filter?: { studySiteId?: string; personId?: string; status?: ExpectedStatus },
) =>
  useQuery({
    queryKey: ["expected", studyId, filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter?.studySiteId) params.set("study_site_id", filter.studySiteId);
      if (filter?.personId) params.set("person_id", filter.personId);
      if (filter?.status) params.set("status", filter.status);
      const qs = params.toString();
      return api<ExpectedDocument[]>(
        `/studies/${studyId}/expected-documents${qs ? `?${qs}` : ""}`,
      );
    },
    enabled: !!studyId,
  });

export const useStaff = (studySiteId: string | undefined) =>
  useQuery({
    queryKey: ["staff", studySiteId],
    queryFn: () => api<StaffMember[]>(`/study-sites/${studySiteId}/staff`),
    enabled: !!studySiteId,
  });

export const useDocument = (documentId: string | undefined) =>
  useQuery({
    queryKey: ["document", documentId],
    queryFn: () => api<DocumentDetail>(`/documents/${documentId}`),
    enabled: !!documentId,
  });

export const useDocumentAudit = (documentId: string | undefined) =>
  useQuery({
    queryKey: ["document-audit", documentId],
    queryFn: () => api<AuditEvent[]>(`/documents/${documentId}/audit`),
    enabled: !!documentId,
  });

export const useChainStatus = () =>
  useQuery({
    queryKey: ["chain"],
    queryFn: () =>
      api<{ events: number; valid: boolean }>("/audit-chain/verify"),
    refetchInterval: 30_000,
  });

export function useUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      tmfArtifactId: number;
      studyId: string;
      studySiteId?: string | null;
      personId?: string | null;
      title: string;
    }) => {
      const form = new FormData();
      form.set("file", input.file);
      form.set("tmf_artifact_id", String(input.tmfArtifactId));
      form.set("study_id", input.studyId);
      if (input.studySiteId) form.set("study_site_id", input.studySiteId);
      if (input.personId) form.set("person_id", input.personId);
      form.set("title", input.title);
      return api<{ document_id: string; version_id: string }>("/documents", {
        method: "POST",
        body: form,
      });
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

// --- Operational layer hooks ---------------------------------------------------

export const useVisits = (
  studyId: string | undefined,
  filter?: { studySiteId?: string; stage?: VisitStage },
) =>
  useQuery({
    queryKey: ["visits", studyId, filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter?.studySiteId) params.set("study_site_id", filter.studySiteId);
      if (filter?.stage) params.set("stage", filter.stage);
      const qs = params.toString();
      return api<MonitoringVisit[]>(
        `/studies/${studyId}/monitoring-visits${qs ? `?${qs}` : ""}`,
      );
    },
    enabled: !!studyId,
  });

export const useVisit = (visitId: string | undefined) =>
  useQuery({
    queryKey: ["visit", visitId],
    queryFn: () => api<VisitDetail>(`/monitoring-visits/${visitId}`),
    enabled: !!visitId,
  });

export const useIssues = (
  studyId: string | undefined,
  filter?: { studySiteId?: string; status?: IssueStatus },
) =>
  useQuery({
    queryKey: ["issues", studyId, filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter?.studySiteId) params.set("study_site_id", filter.studySiteId);
      if (filter?.status) params.set("status", filter.status);
      const qs = params.toString();
      return api<Issue[]>(`/studies/${studyId}/issues${qs ? `?${qs}` : ""}`);
    },
    enabled: !!studyId,
  });

export const useEnrollment = (studyId: string | undefined) =>
  useQuery({
    queryKey: ["enrollment", studyId],
    queryFn: () => api<SiteEnrollment[]>(`/studies/${studyId}/enrollment`),
    enabled: !!studyId,
  });

export const useMilestones = (studyId: string | undefined) =>
  useQuery({
    queryKey: ["milestones", studyId],
    queryFn: () => api<Milestone[]>(`/studies/${studyId}/milestones`),
    enabled: !!studyId,
  });

export const useAuditEvents = (filter?: {
  entityType?: string;
  entityId?: string;
  limit?: number;
}) =>
  useQuery({
    queryKey: ["audit-events", filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter?.entityType) params.set("entity_type", filter.entityType);
      if (filter?.entityId) params.set("entity_id", filter.entityId);
      if (filter?.limit) params.set("limit", String(filter.limit));
      const qs = params.toString();
      return api<AuditEvent[]>(`/audit-events${qs ? `?${qs}` : ""}`);
    },
  });

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function useScheduleVisit(studyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      studySiteId: string;
      visitType: VisitType;
      scheduledDate: string;
    }) =>
      api<{ id: string }>(
        `/studies/${studyId}/monitoring-visits`,
        jsonInit("POST", {
          study_site_id: input.studySiteId,
          visit_type: input.visitType,
          scheduled_date: input.scheduledDate,
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useUpdateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      visitId: string;
      visitDate?: string;
      summary?: string;
    }) =>
      api<{ id: string }>(
        `/monitoring-visits/${input.visitId}`,
        jsonInit("PATCH", {
          ...(input.visitDate !== undefined ? { visit_date: input.visitDate } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Upload a visit document (trip report / letter): fresh document, linked to the visit. */
export function useVisitUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      visitId: string;
      file: File;
      title: string;
      linkKind: "trip_report" | "confirmation_letter" | "follow_up_letter";
    }) => {
      const form = new FormData();
      form.set("file", input.file);
      form.set("title", input.title);
      form.set("link_kind", input.linkKind);
      return api<{ document_id: string; version_id: string }>(
        `/monitoring-visits/${input.visitId}/documents`,
        { method: "POST", body: form },
      );
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCreateActionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { visitId: string; description: string; dueDate?: string }) =>
      api<{ id: string }>(
        `/monitoring-visits/${input.visitId}/action-items`,
        jsonInit("POST", {
          description: input.description,
          ...(input.dueDate ? { due_date: input.dueDate } : {}),
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useResolveActionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { actionItemId: string; resolutionNote?: string }) =>
      api<{ id: string }>(
        `/action-items/${input.actionItemId}`,
        jsonInit("PATCH", {
          ...(input.resolutionNote ? { resolution_note: input.resolutionNote } : {}),
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCreateIssue(studyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      studySiteId?: string;
      monitoringVisitId?: string;
      category: IssueCategory;
      severity: IssueSeverity;
      title: string;
      identifiedDate: string;
      dueDate?: string;
    }) =>
      api<{ id: string }>(
        `/studies/${studyId}/issues`,
        jsonInit("POST", {
          ...(input.studySiteId ? { study_site_id: input.studySiteId } : {}),
          ...(input.monitoringVisitId
            ? { monitoring_visit_id: input.monitoringVisitId }
            : {}),
          category: input.category,
          severity: input.severity,
          title: input.title,
          identified_date: input.identifiedDate,
          ...(input.dueDate ? { due_date: input.dueDate } : {}),
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useResolveIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { issueId: string; resolutionNote?: string }) =>
      api<{ id: string }>(
        `/issues/${input.issueId}`,
        jsonInit("PATCH", {
          ...(input.resolutionNote ? { resolution_note: input.resolutionNote } : {}),
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCreateMilestone(studyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; plannedDate: string; studySiteId?: string }) =>
      api<{ id: string }>(
        `/studies/${studyId}/milestones`,
        jsonInit("POST", {
          name: input.name,
          planned_date: input.plannedDate,
          ...(input.studySiteId ? { study_site_id: input.studySiteId } : {}),
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useAchieveMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { milestoneId: string; actualDate?: string }) =>
      api<{ id: string }>(
        `/milestones/${input.milestoneId}`,
        jsonInit("PATCH", {
          ...(input.actualDate ? { actual_date: input.actualDate } : {}),
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useReportEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      studySiteId: string;
      asOfDate: string;
      screened: number;
      enrolled: number;
      withdrawn: number;
      completed: number;
    }) =>
      api<{ id: string }>(
        `/study-sites/${input.studySiteId}/enrollment`,
        jsonInit("PUT", {
          as_of_date: input.asOfDate,
          screened: input.screened,
          enrolled: input.enrolled,
          withdrawn: input.withdrawn,
          completed: input.completed,
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// --- Portfolio hook (ADR-0021) --------------------------------------------------

export const usePortfolio = () =>
  useQuery({ queryKey: ["portfolio"], queryFn: () => api<PortfolioEntry[]>("/portfolio") });

// --- Document search hook (ADR-0019) ------------------------------------------

export const useDocumentSearch = (
  studyId: string | undefined,
  q: string,
  status?: string,
) =>
  useQuery({
    queryKey: ["document-search", studyId, q, status],
    queryFn: () => {
      const params = new URLSearchParams({ q });
      if (status) params.set("status", status);
      return api<SearchResult[]>(`/studies/${studyId}/document-search?${params}`);
    },
    enabled: !!studyId && q.trim().length >= 2,
  });

// --- Review queue hooks (ADR-0018) -------------------------------------------

export const useReviewQueue = (
  studyId: string | undefined,
  filter?: { assignedTo?: string; status?: QueueStatus },
) =>
  useQuery({
    queryKey: ["review-queue", studyId, filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter?.assignedTo) params.set("assigned_to", filter.assignedTo);
      if (filter?.status) params.set("status", filter.status);
      const qs = params.toString();
      return api<QueueEntry[]>(`/studies/${studyId}/review-queue${qs ? `?${qs}` : ""}`);
    },
    enabled: !!studyId,
  });

export function useAssignReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      versionId: string;
      assigneePersonId: string;
      dueDate?: string;
      note?: string;
    }) =>
      api<{ assignment_id: string }>(
        `/document-versions/${input.versionId}/assign-review`,
        jsonInit("POST", {
          assignee_person_id: input.assigneePersonId,
          ...(input.dueDate ? { due_date: input.dueDate } : {}),
          ...(input.note ? { note: input.note } : {}),
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Return-for-correction: the review outcome besides approval (ADR-0015). */
export function useReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { versionId: string; reason: string }) =>
      api<{ return_id: string }>(`/document-versions/${input.versionId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: input.reason }),
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// --- Administration hooks (ADR-0016) ---------------------------------------

export const useOrganizations = () =>
  useQuery({
    queryKey: ["organizations"],
    queryFn: () => api<Organization[]>("/organizations"),
  });

export const useSiteDirectory = () =>
  useQuery({ queryKey: ["site-directory"], queryFn: () => api<SiteDirectoryEntry[]>("/sites") });

export const usePeople = () =>
  useQuery({ queryKey: ["people"], queryFn: () => api<Person[]>("/people") });

export const useTmfArtifacts = () =>
  useQuery({
    queryKey: ["tmf-artifacts"],
    queryFn: () => api<TmfArtifact[]>("/tmf-artifacts"),
  });

export const useRequirementRules = (studyId: string | undefined) =>
  useQuery({
    queryKey: ["requirement-rules", studyId],
    queryFn: () => api<RequirementRule[]>(`/studies/${studyId}/requirement-rules`),
    enabled: !!studyId,
  });

/** Generic invalidate-everything mutation over a JSON endpoint. */
function useAdminMutation<TInput>(toRequest: (input: TInput) => [string, RequestInit]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => {
      const [path, init] = toRequest(input);
      return api<{ id: string }>(path, init);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export const useCreateOrganization = () =>
  useAdminMutation((input: { name: string; kind: OrgKind }) => [
    "/organizations",
    jsonInit("POST", input),
  ]);

export const useCreateSite = () =>
  useAdminMutation(
    (input: {
      organizationId: string;
      name: string;
      city?: string;
      state?: string;
      country?: string;
    }) => [
      "/sites",
      jsonInit("POST", {
        organization_id: input.organizationId,
        name: input.name,
        ...(input.city ? { city: input.city } : {}),
        ...(input.state ? { state: input.state } : {}),
        ...(input.country ? { country: input.country } : {}),
      }),
    ],
  );

export const useCreatePerson = () =>
  useAdminMutation(
    (input: {
      givenName: string;
      familyName: string;
      email: string;
      credentials?: string;
    }) => [
      "/people",
      jsonInit("POST", {
        given_name: input.givenName,
        family_name: input.familyName,
        email: input.email,
        ...(input.credentials ? { credentials: input.credentials } : {}),
      }),
    ],
  );

export const useAddStudySite = (studyId: string | undefined) =>
  useAdminMutation(
    (input: { siteId: string; siteNumber: string; targetEnrollment?: number }) => [
      `/studies/${studyId}/sites`,
      jsonInit("POST", {
        site_id: input.siteId,
        site_number: input.siteNumber,
        ...(input.targetEnrollment ? { target_enrollment: input.targetEnrollment } : {}),
      }),
    ],
  );

export const useUpdateStudySite = () =>
  useAdminMutation(
    (input: {
      studySiteId: string;
      status?: "pending" | "active" | "closed";
      activatedAt?: string | null;
    }) => [
      `/study-sites/${input.studySiteId}`,
      jsonInit("PATCH", {
        ...(input.status ? { status: input.status } : {}),
        ...(input.activatedAt !== undefined ? { activated_at: input.activatedAt } : {}),
      }),
    ],
  );

export const useAssignSiteRole = () =>
  useAdminMutation(
    (input: {
      studySiteId: string;
      personId: string;
      role: StaffRole;
      startDate: string;
    }) => [
      `/study-sites/${input.studySiteId}/roles`,
      jsonInit("POST", {
        person_id: input.personId,
        role: input.role,
        start_date: input.startDate,
      }),
    ],
  );

export const useEndSiteRole = () =>
  useAdminMutation((input: { roleId: string; endDate: string }) => [
    `/study-site-roles/${input.roleId}`,
    jsonInit("PATCH", { end_date: input.endDate }),
  ]);

export const useGrantAccess = () =>
  useAdminMutation(
    (input: {
      personId: string;
      role: AccessRole;
      studyId?: string;
      studySiteId?: string;
    }) => [
      "/access-grants",
      jsonInit("POST", {
        person_id: input.personId,
        role: input.role,
        ...(input.studyId ? { study_id: input.studyId } : {}),
        ...(input.studySiteId ? { study_site_id: input.studySiteId } : {}),
      }),
    ],
  );

export const useRevokeGrant = () =>
  useAdminMutation((input: { grantId: string }) => [
    `/access-grants/${input.grantId}/revoke`,
    jsonInit("POST", {}),
  ]);

export const useCreateRule = (studyId: string | undefined) =>
  useAdminMutation(
    (input: {
      tmfArtifactId: number;
      scopeLevel: "study" | "study_site" | "person_role";
      name: string;
      description?: string;
      appliesToRoles?: StaffRole[];
      validityMonths?: number;
      requiresSignature?: boolean;
    }) => [
      `/studies/${studyId}/requirement-rules`,
      jsonInit("POST", {
        tmf_artifact_id: input.tmfArtifactId,
        scope_level: input.scopeLevel,
        name: input.name,
        ...(input.description ? { description: input.description } : {}),
        ...(input.appliesToRoles ? { applies_to_roles: input.appliesToRoles } : {}),
        ...(input.validityMonths ? { validity_months: input.validityMonths } : {}),
        ...(input.requiresSignature !== undefined
          ? { requires_signature: input.requiresSignature }
          : {}),
      }),
    ],
  );

export const useUpdateRule = () =>
  useAdminMutation(
    (input: {
      ruleId: string;
      name?: string;
      validityMonths?: number | null;
      requiresSignature?: boolean;
    }) => [
      `/requirement-rules/${input.ruleId}`,
      jsonInit("PATCH", {
        ...(input.name ? { name: input.name } : {}),
        ...(input.validityMonths !== undefined
          ? { validity_months: input.validityMonths }
          : {}),
        ...(input.requiresSignature !== undefined
          ? { requires_signature: input.requiresSignature }
          : {}),
      }),
    ],
  );

export const useSyncExpected = (studyId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ inserted: number }>(`/studies/${studyId}/sync-expected-documents`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
};

// --- Site seat hooks (ADR-0023) ----------------------------------------------

export const useMe = () =>
  useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), staleTime: Infinity });

/** Every grant is site-scoped: render the site seat, not the study dashboard. */
export const isSiteSeat = (me: Me | undefined) =>
  !!me && me.grants.length > 0 && me.grants.every((g) => g.study_site_id !== null);

export const useSiteOverview = (studySiteId: string | undefined) =>
  useQuery({
    queryKey: ["site-overview", studySiteId],
    queryFn: () => api<SiteOverview>(`/study-sites/${studySiteId}`),
    enabled: !!studySiteId,
  });

export const useSiteExpected = (studySiteId: string | undefined) =>
  useQuery({
    queryKey: ["site-expected", studySiteId],
    queryFn: () =>
      api<ExpectedDocument[]>(`/study-sites/${studySiteId}/expected-documents`),
    enabled: !!studySiteId,
  });

export const useSiteEnrollment = (studySiteId: string | undefined) =>
  useQuery({
    queryKey: ["site-enrollment", studySiteId],
    queryFn: () => api<SiteEnrollment[]>(`/study-sites/${studySiteId}/enrollment`),
    enabled: !!studySiteId,
  });

export const useDelegationLog = (studySiteId: string | undefined) =>
  useQuery({
    queryKey: ["delegation-log", studySiteId],
    queryFn: () => api<Delegation[]>(`/study-sites/${studySiteId}/delegation-log`),
    enabled: !!studySiteId,
  });

export const useTrainingLog = (studySiteId: string | undefined) =>
  useQuery({
    queryKey: ["training-log", studySiteId],
    queryFn: () => api<TrainingRecord[]>(`/study-sites/${studySiteId}/training-log`),
    enabled: !!studySiteId,
  });

export function useCreateDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      studySiteId: string;
      personId: string;
      delegatedTasks: string[];
      startDate: string;
      authorizedBy: string;
    }) =>
      api<{ id: string }>(
        `/study-sites/${input.studySiteId}/delegation-log`,
        jsonInit("POST", {
          person_id: input.personId,
          delegated_tasks: input.delegatedTasks,
          start_date: input.startDate,
          authorized_by: input.authorizedBy,
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useEndDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { delegationId: string; endDate: string }) =>
      api<{ id: string }>(
        `/delegations/${input.delegationId}`,
        jsonInit("PATCH", { end_date: input.endDate }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRecordTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      studySiteId: string;
      personId: string;
      topic: string;
      trainedOn: string;
      expiresAt?: string;
    }) =>
      api<{ id: string }>(
        `/study-sites/${input.studySiteId}/training-log`,
        jsonInit("POST", {
          person_id: input.personId,
          topic: input.topic,
          trained_on: input.trainedOn,
          ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Waive an expected document: the absence is explained, not a gap (ADR-0016). */
export function useWaive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { expectedDocumentId: string; reason: string }) =>
      api<{ waiver_id: string }>(
        `/expected-documents/${input.expectedDocumentId}/waive`,
        jsonInit("POST", { reason: input.reason }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRevokeWaiver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { expectedDocumentId: string; reason: string }) =>
      api<{ waiver_id: string }>(
        `/expected-documents/${input.expectedDocumentId}/revoke-waiver`,
        jsonInit("POST", { reason: input.reason }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/**
 * Bulk approval (ADR-0026): one re-authentication opens a §11.200(a)(1)(i)
 * series of signings; every selected version gains its own signature bound
 * to its own content hash. All-or-nothing on the server.
 */
export function useBulkApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { versionIds: string[] }) => {
      const reauthToken = await getReauthToken();
      return api<{ signed: { version_id: string; signature_id: string }[] }>(
        "/document-versions/bulk-approve",
        jsonInit("POST", { version_ids: input.versionIds, reauth_token: reauthToken }),
      );
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Bulk return-for-correction: one shared documented reason (ADR-0026). */
export function useBulkReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { versionIds: string[]; reason: string }) =>
      api<{ returned: { version_id: string; return_id: string }[] }>(
        "/document-versions/bulk-return",
        jsonInit("POST", { version_ids: input.versionIds, reason: input.reason }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      versionId: string;
      meaning: "author" | "review" | "approval";
      expiresAt?: string;
    }) => {
      // §11.200: signing requires fresh proof of identity, obtained here
      // (IdP popup in oidc mode; restated dev token otherwise).
      const reauthToken = await getReauthToken();
      return api<{ signature_id: string }>(`/document-versions/${input.versionId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meaning: input.meaning,
          reauth_token: reauthToken,
          ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
        }),
      });
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
