import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authMode, beginLogin, getReauthToken, token } from "./auth";

export type ExpectedStatus =
  | "missing"
  | "pending_review"
  | "returned"
  | "current"
  | "expiring_soon"
  | "expired"
  | "superseded";

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
