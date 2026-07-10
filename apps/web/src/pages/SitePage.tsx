import { ArrowLeft, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useEnrollment,
  useExpected,
  useIssues,
  useSites,
  useStaff,
  useUpload,
  useVisits,
  type ExpectedDocument,
  type Study,
} from "../api";
import {
  EnrollmentBars,
  IssueListItem,
  ReportEnrollmentForm,
  ScheduleVisitForm,
  VisitListItem,
} from "../ops";
import { StatusChip } from "../status";

const ROLE_LABEL: Record<string, string> = {
  principal_investigator: "Principal Investigator",
  sub_investigator: "Sub-Investigator",
  study_coordinator: "Study Coordinator",
  pharmacist: "Pharmacist",
  research_nurse: "Research Nurse",
};

export default function SitePage({ study }: { study: Study | undefined }) {
  const { studySiteId } = useParams();
  const { data: sites } = useSites(study?.id);
  const site = sites?.find((s) => s.study_site_id === studySiteId);
  const { data: expected } = useExpected(study?.id, { studySiteId });
  const { data: staff } = useStaff(studySiteId);
  const { data: visits } = useVisits(study?.id, { studySiteId });
  const { data: issues } = useIssues(study?.id, { studySiteId });
  const { data: enrollment } = useEnrollment(study?.id);
  const siteEnrollment = enrollment?.filter((e) => e.study_site_id === studySiteId);

  const byZone = useMemo(() => {
    const zones = new Map<string, ExpectedDocument[]>();
    for (const r of expected ?? []) {
      const key = `${String(r.zone_number).padStart(2, "0")} ${r.zone_name}`;
      zones.set(key, [...(zones.get(key) ?? []), r]);
    }
    return zones;
  }, [expected]);

  if (!study || !site) return <div className="text-ink2">Loading site…</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink2 hover:underline">
          <ArrowLeft size={14} aria-hidden /> {study.protocol_number}
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-xl font-semibold">
            Site {site.site_number} — {site.site_name}
          </h1>
          <span className="text-sm text-ink2">
            {site.city}, {site.state} ·{" "}
            {site.status === "active"
              ? `active since ${site.activated_at}`
              : site.status}
          </span>
        </div>
        <div className="mt-2 text-sm text-ink2">
          <span className="font-semibold text-ink">{site.pct_current}%</span> of{" "}
          {site.total} expected documents current · {site.missing_count} missing ·{" "}
          {site.expired_count} expired · {site.expiring_soon_count} expiring ·{" "}
          {site.pending_review_count} pending review
        </div>
      </div>

      <section className="card">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">Staff</h2>
        <ul className="divide-y divide-hairline">
          {staff?.map((m) => (
            <li key={m.role_id} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5">
              <span className="text-sm font-medium">
                {m.given_name} {m.family_name}
                {m.credentials ? `, ${m.credentials}` : ""}
              </span>
              <span className="text-xs text-ink2">{ROLE_LABEL[m.role] ?? m.role}</span>
              <span className="ml-auto text-xs">
                {m.open_items === 0 ? (
                  <span style={{ color: "var(--status-good)" }}>all documents current</span>
                ) : (
                  <span style={{ color: "var(--status-serious)" }}>
                    {m.open_items} open item{m.open_items > 1 ? "s" : ""}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
          <h2 className="font-medium">Monitoring visits</h2>
          <div className="ml-auto">
            <ScheduleVisitForm studyId={study.id} studySiteId={site.study_site_id} />
          </div>
        </div>
        {visits?.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No visits yet.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {visits?.map((v) => (
              <VisitListItem key={v.monitoring_visit_id} v={v} />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">Issues & deviations</h2>
        {issues?.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No issues at this site.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {issues?.map((i) => (
              <IssueListItem key={i.id} issue={i} />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">
          Enrollment{" "}
          <span className="text-xs font-normal text-muted">
            as-reported aggregates; corrections are audited
          </span>
        </h2>
        <EnrollmentBars rows={siteEnrollment ?? []} />
        <div className="border-t border-hairline px-4 py-3">
          <ReportEnrollmentForm
            studySiteId={site.study_site_id}
            latest={siteEnrollment?.[0]}
          />
        </div>
      </section>

      {[...byZone.entries()].map(([zoneLabel, rows]) => (
        <section key={zoneLabel} className="card">
          <h2 className="border-b border-hairline px-4 py-3 text-sm font-medium text-ink2">
            {zoneLabel}
          </h2>
          <ul className="divide-y divide-hairline">
            {rows.map((r) => (
              <ExpectedRow key={r.expected_document_id} row={r} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ExpectedRow({ row }: { row: ExpectedDocument }) {
  const upload = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const person =
    row.person_id && `${row.person_given_name} ${row.person_family_name}`;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <span className="mono text-xs text-muted">{row.artifact_code}</span>
      <div className="min-w-0">
        {row.document_id ? (
          <Link to={`/documents/${row.document_id}`} className="text-sm hover:underline">
            {row.document_title ?? row.artifact_name}
          </Link>
        ) : (
          <span className="text-sm text-ink2">{row.artifact_name}</span>
        )}
        <div className="text-xs text-muted">
          {person ? `${person} · ` : ""}
          {row.rule_name}
          {row.effective_expiry ? ` · expires ${row.effective_expiry}` : ""}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {(row.status === "missing" || row.status === "expired") && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setErr(null);
                upload.mutate(
                  {
                    file,
                    tmfArtifactId: row.tmf_artifact_id,
                    studyId: row.study_id,
                    studySiteId: row.study_site_id,
                    personId: row.person_id,
                    title: person
                      ? `${row.artifact_name} — ${person}`
                      : `${row.artifact_name} — Site ${row.site_number}`,
                  },
                  { onError: (e) => setErr(String(e)) },
                );
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
            >
              <Upload size={12} aria-hidden />
              {upload.isPending ? "Uploading…" : "Upload"}
            </button>
          </>
        )}
        <StatusChip status={row.status} />
      </div>
      {err && <div className="w-full text-xs" style={{ color: "var(--status-critical)" }}>{err}</div>}
    </li>
  );
}
