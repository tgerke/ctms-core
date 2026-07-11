import { ArrowLeft, CircleSlash, Undo2, Upload, UserPlus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useAssignSiteRole,
  useEndSiteRole,
  useEnrollment,
  useExpected,
  useIssues,
  usePeople,
  useRevokeWaiver,
  useSites,
  useStaff,
  useSyncExpected,
  useUpload,
  useVisits,
  useWaive,
  type ExpectedDocument,
  type StaffMember,
  type StaffRole,
  type Study,
} from "../api";
import {
  EnrollmentBars,
  ErrorNote,
  IssueListItem,
  localToday,
  NewIssueForm,
  PageState,
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
  const sitesQuery = useSites(study?.id);
  const sites = sitesQuery.data;
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

  if (!study || !site) return <PageState query={sitesQuery} label="site" />;

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
          {site.returned_count > 0 ? ` · ${site.returned_count} returned` : ""}
          {site.waived_count > 0 ? ` · ${site.waived_count} waived` : ""}
        </div>
      </div>

      <section className="card">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">Staff</h2>
        <ul className="divide-y divide-hairline">
          {staff?.map((m) => (
            <StaffRow key={m.role_id} m={m} />
          ))}
        </ul>
        <div className="border-t border-hairline px-4 py-3">
          <AddStaffForm studyId={study.id} studySiteId={site.study_site_id} />
        </div>
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
        <div className="border-t border-hairline px-4 py-3">
          <NewIssueForm studyId={study.id} studySiteId={site.study_site_id} />
        </div>
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
  const waive = useWaive();
  const liftWaiver = useRevokeWaiver();
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<unknown>(null);

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
        {row.status === "waived" && (
          <div className="text-xs text-ink2">
            ↳ waived {row.waived_at?.slice(0, 10)} by {row.waived_by_given_name}{" "}
            {row.waived_by_family_name}: {row.waiver_reason}
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {row.status === "missing" && (
          <ReasonAction
            icon={CircleSlash}
            label="Waive"
            prompt="Why is this document not applicable?"
            pendingLabel="Waiving…"
            pending={waive.isPending}
            onConfirm={(reason) => {
              setErr(null);
              waive.mutate(
                { expectedDocumentId: row.expected_document_id, reason },
                { onError: (e) => setErr(e) },
              );
            }}
          />
        )}
        {row.status === "waived" && (
          <ReasonAction
            icon={Undo2}
            label="Lift waiver"
            prompt="Why does this requirement apply again?"
            pendingLabel="Lifting…"
            pending={liftWaiver.isPending}
            onConfirm={(reason) => {
              setErr(null);
              liftWaiver.mutate(
                { expectedDocumentId: row.expected_document_id, reason },
                { onError: (e) => setErr(e) },
              );
            }}
          />
        )}
        {(row.status === "missing" ||
          row.status === "expired" ||
          row.status === "returned") && (
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
                  { onError: (e) => setErr(e) },
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
      <ErrorNote error={err} className="w-full" />
    </li>
  );
}

/** Button that expands to a required-reason input before firing its action. */
function ReasonAction({
  icon: Icon,
  label,
  prompt,
  pendingLabel,
  pending,
  onConfirm,
}: {
  icon: typeof CircleSlash;
  label: string;
  prompt: string;
  pendingLabel: string;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page"
      >
        <Icon size={12} aria-hidden />
        {label}
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason.trim()) return;
        onConfirm(reason.trim());
        setOpen(false);
        setReason("");
      }}
    >
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={prompt}
        className="w-64 rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label={prompt}
        autoFocus
      />
      <button
        type="submit"
        disabled={pending || !reason.trim()}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
      >
        <Icon size={12} aria-hidden />
        {pending ? pendingLabel : label}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-muted hover:underline"
      >
        cancel
      </button>
    </form>
  );
}

function StaffRow({ m }: { m: StaffMember }) {
  const endRole = useEndSiteRole();
  const [err, setErr] = useState<unknown>(null);
  const ended = m.end_date !== null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 px-4 py-2.5">
      <span className={`text-sm font-medium ${ended ? "text-muted line-through" : ""}`}>
        {m.given_name} {m.family_name}
        {m.credentials ? `, ${m.credentials}` : ""}
      </span>
      <span className="text-xs text-ink2">
        {ROLE_LABEL[m.role] ?? m.role}
        {ended ? ` · ended ${m.end_date}` : ""}
      </span>
      <span className="ml-auto flex items-center gap-2 text-xs">
        {!ended &&
          (m.open_items === 0 ? (
            <span style={{ color: "var(--status-good)" }}>all documents current</span>
          ) : (
            <span style={{ color: "var(--status-serious)" }}>
              {m.open_items} open item{m.open_items > 1 ? "s" : ""}
            </span>
          ))}
        {!ended && (
          <button
            onClick={() => {
              setErr(null);
              endRole.mutate(
                { roleId: m.role_id, endDate: localToday() },
                { onError: (e) => setErr(e) },
              );
            }}
            disabled={endRole.isPending}
            className="rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
            title="Records today as the role's end date — assignments are never deleted"
          >
            {endRole.isPending ? "Ending…" : "End role"}
          </button>
        )}
      </span>
      <ErrorNote error={err} className="w-full" />
    </li>
  );
}

const STAFF_ROLES = Object.keys(ROLE_LABEL) as StaffRole[];

function AddStaffForm({
  studyId,
  studySiteId,
}: {
  studyId: string;
  studySiteId: string;
}) {
  const { data: people } = usePeople();
  const assign = useAssignSiteRole();
  const sync = useSyncExpected(studyId);
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<StaffRole>("study_coordinator");
  const [start, setStart] = useState(localToday());
  const [err, setErr] = useState<unknown>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!personId) return;
        setErr(null);
        assign.mutate(
          { studySiteId, personId, role, startDate: start },
          {
            onError: (e) => setErr(e),
            // Person-scoped requirements (CV, licenses, GCP) materialize on sync.
            onSuccess: () => {
              setPersonId("");
              sync.mutate(undefined, { onError: (e) => setErr(e) });
            },
          },
        );
      }}
    >
      <select
        value={personId}
        onChange={(e) => setPersonId(e.target.value)}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Person"
      >
        <option value="">Add staff…</option>
        {people?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.family_name}, {p.given_name}
            {p.credentials ? ` (${p.credentials})` : ""}
          </option>
        ))}
      </select>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as StaffRole)}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Site role"
      >
        {STAFF_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-ink2">
        from
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
          aria-label="Start date"
          required
        />
      </label>
      <button
        type="submit"
        disabled={assign.isPending || sync.isPending || !personId}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
      >
        <UserPlus size={12} aria-hidden />
        {assign.isPending || sync.isPending ? "Adding…" : "Assign role"}
      </button>
      <span className="text-xs text-muted">
        New person? Create them on the <Link to="/admin" className="hover:underline">admin page</Link> first.
      </span>
      <ErrorNote error={err} className="w-full" />
    </form>
  );
}
