import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ExpectedStatus =
  | "missing"
  | "pending_review"
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
}

const token = () => localStorage.getItem("ctms_token") ?? "dev-admin-token";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
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

export function useSign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      versionId: string;
      meaning: "author" | "review" | "approval";
      expiresAt?: string;
    }) =>
      api<{ signature_id: string }>(`/document-versions/${input.versionId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meaning: input.meaning,
          ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
        }),
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
