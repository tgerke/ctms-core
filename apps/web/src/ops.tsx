import { CalendarPlus, CheckCircle2, CircleAlert, Flag, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  can,
  errorMessage,
  useAchieveMilestone,
  useCreateIssue,
  useCreateMilestone,
  useMe,
  useReportEnrollment,
  useResolveIssue,
  useScheduleVisit,
  type Issue,
  type IssueCategory,
  type IssueSeverity,
  type Milestone,
  type MonitoringVisit,
  type SiteEnrollment,
  type VisitType,
} from "./api";
import { ISSUE_SEVERITY, ISSUE_STATUS, SpecChip, VISIT_STAGE } from "./status";

export const VISIT_TYPE_LABEL: Record<VisitType, string> = {
  pre_study: "Pre-study",
  initiation: "Initiation",
  interim: "Interim",
  close_out: "Close-out",
};

/** Today as YYYY-MM-DD in the user's time zone — toISOString() is UTC and rolls to tomorrow in US evenings. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  protocol_deviation: "Protocol deviation",
  monitoring_finding: "Monitoring finding",
  safety: "Safety",
  data_quality: "Data quality",
  other: "Other",
};

/** Plain-language error line for failed mutations; renders nothing when clear. */
export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  if (error == null) return null;
  return (
    <div
      className={`flex items-center gap-1 text-xs ${className ?? ""}`}
      style={{ color: "var(--status-critical)" }}
    >
      <CircleAlert size={12} aria-hidden />
      <span>{errorMessage(error)}</span>
    </div>
  );
}

/** Loading / error / not-found states for a page's primary query. */
export function PageState({
  query,
  label,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown };
  label: string;
}) {
  if (query.isError)
    return (
      <div
        className="flex items-center gap-2 text-sm"
        style={{ color: "var(--status-critical)" }}
      >
        <CircleAlert size={14} aria-hidden />
        <span>
          Couldn't load the {label}. {errorMessage(query.error)}
        </span>
      </div>
    );
  if (query.isPending) return <div className="text-sm text-ink2">Loading {label}…</div>;
  return (
    <div className="text-sm text-ink2">
      No {label} found — it may have been removed, or the link may be out of date.
    </div>
  );
}

export function VisitListItem({ v, showSite }: { v: MonitoringVisit; showSite?: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <Link to={`/visits/${v.monitoring_visit_id}`} className="text-sm hover:underline">
        {VISIT_TYPE_LABEL[v.visit_type]} visit
        {showSite ? ` — Site ${v.site_number}` : ""}
      </Link>
      <span className="text-xs text-muted">
        {v.visit_date ? `conducted ${v.visit_date}` : `scheduled ${v.scheduled_date}`}
        {v.monitor_family_name ? ` · ${v.monitor_given_name} ${v.monitor_family_name}` : ""}
        {v.open_action_items > 0
          ? ` · ${v.open_action_items} open action item${v.open_action_items > 1 ? "s" : ""}`
          : ""}
      </span>
      <span className="ml-auto">
        <SpecChip spec={VISIT_STAGE[v.stage]} />
      </span>
    </li>
  );
}

export function IssueListItem({ issue, showSite }: { issue: Issue; showSite?: boolean }) {
  const resolve = useResolveIssue();
  const { data: me } = useMe();
  const [err, setErr] = useState<unknown>(null);
  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SpecChip spec={ISSUE_SEVERITY[issue.severity]} />
        <span className="text-sm">{issue.title}</span>
        <span className="ml-auto flex items-center gap-2">
          {can(me, "upload") && issue.status !== "resolved" && (
            <button
              onClick={() => {
                setErr(null);
                resolve.mutate(
                  { issueId: issue.id },
                  { onError: (e) => setErr(e) },
                );
              }}
              disabled={resolve.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
            >
              <CheckCircle2 size={12} aria-hidden />
              {resolve.isPending ? "Resolving…" : "Resolve"}
            </button>
          )}
          <SpecChip spec={ISSUE_STATUS[issue.status]} />
        </span>
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {issue.category.replace(/_/g, " ")}
        {showSite && issue.site_number ? ` · Site ${issue.site_number}` : ""}
        {!issue.site_number ? " · study-level" : ""}
        {" · identified "}
        {issue.identified_date}
        {issue.due_date && !issue.resolved_at ? ` · due ${issue.due_date}` : ""}
        {issue.resolved_at ? ` · resolved ${issue.resolved_at}` : ""}
        {issue.monitoring_visit_id ? (
          <>
            {" · "}
            <Link to={`/visits/${issue.monitoring_visit_id}`} className="hover:underline">
              from visit
            </Link>
          </>
        ) : null}
      </div>
      {issue.resolution_note && (
        <div className="mt-0.5 text-xs text-ink2">↳ {issue.resolution_note}</div>
      )}
      <ErrorNote error={err} className="mt-1" />
    </li>
  );
}

export function MilestoneStrip({
  milestones,
  achievable,
}: {
  milestones: Milestone[];
  achievable?: boolean;
}) {
  const achieve = useAchieveMilestone();
  const { data: me } = useMe();
  const [err, setErr] = useState<unknown>(null);
  return (
    <>
      <ol className="flex flex-wrap gap-2">
        {milestones.map((m) => {
          const color =
            m.status === "achieved"
              ? "--status-good"
              : m.status === "overdue"
                ? "--status-critical"
                : "--muted";
          return (
            <li
              key={m.id}
              className="flex items-center gap-2 rounded-md border border-hairline px-3 py-2"
              title={
                m.actual_date
                  ? `Planned ${m.planned_date}, achieved ${m.actual_date}`
                  : `Planned ${m.planned_date} — ${m.status}`
              }
            >
              <Flag size={13} style={{ color: `var(${color})` }} aria-hidden />
              <span className="text-sm">
                {m.name}
                {m.site_number ? ` (Site ${m.site_number})` : ""}
              </span>
              <span className="text-xs text-muted">
                {m.actual_date ?? m.planned_date}
              </span>
              {achievable && can(me, "upload") && m.status !== "achieved" && (
                <button
                  onClick={() => {
                    setErr(null);
                    achieve.mutate(
                      { milestoneId: m.id },
                      { onError: (e) => setErr(e) },
                    );
                  }}
                  disabled={achieve.isPending}
                  className="inline-flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
                >
                  <CheckCircle2 size={12} aria-hidden />
                  {achieve.isPending ? "Marking…" : "Mark achieved"}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <ErrorNote error={err} className="mt-2" />
    </>
  );
}

export function AddMilestoneForm({
  studyId,
  sites,
}: {
  studyId: string;
  sites: { study_site_id: string; site_number: string }[];
}) {
  const create = useCreateMilestone(studyId);
  const { data: me } = useMe();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [siteId, setSiteId] = useState("");
  const [err, setErr] = useState<unknown>(null);
  // Grant-aware rendering (ADR-0028): no form for a seat that can only read.
  if (!can(me, "upload")) return null;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name || !date) return;
        setErr(null);
        create.mutate(
          { name, plannedDate: date, studySiteId: siteId || undefined },
          {
            onError: (e) => setErr(e),
            onSuccess: () => {
              setName("");
              setDate("");
              setSiteId("");
            },
          },
        );
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New milestone…"
        className="w-44 rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Milestone name"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Planned date"
        required
      />
      <select
        value={siteId}
        onChange={(e) => setSiteId(e.target.value)}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Milestone scope"
      >
        <option value="">Study-wide</option>
        {sites.map((s) => (
          <option key={s.study_site_id} value={s.study_site_id}>
            Site {s.site_number}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={create.isPending || !name}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
      >
        <Flag size={12} aria-hidden />
        {create.isPending ? "Adding…" : "Add milestone"}
      </button>
      <ErrorNote error={err} className="w-full" />
    </form>
  );
}

export function NewIssueForm({
  studyId,
  studySiteId,
  monitoringVisitId,
}: {
  studyId: string;
  studySiteId?: string;
  monitoringVisitId?: string;
}) {
  const create = useCreateIssue(studyId);
  const { data: me } = useMe();
  const today = localToday();
  const [category, setCategory] = useState<IssueCategory>("protocol_deviation");
  const [severity, setSeverity] = useState<IssueSeverity>("minor");
  const [title, setTitle] = useState("");
  const [identified, setIdentified] = useState(today);
  const [due, setDue] = useState("");
  const [err, setErr] = useState<unknown>(null);
  if (!can(me, "upload")) return null;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title || !identified) return;
        setErr(null);
        create.mutate(
          {
            studySiteId,
            monitoringVisitId,
            category,
            severity,
            title,
            identifiedDate: identified,
            dueDate: due || undefined,
          },
          {
            onError: (e) => setErr(e),
            onSuccess: () => {
              setTitle("");
              setDue("");
              setIdentified(today);
            },
          },
        );
      }}
    >
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as IssueCategory)}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Issue category"
      >
        {Object.entries(ISSUE_CATEGORY_LABEL).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={severity}
        onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Severity"
      >
        {(Object.keys(ISSUE_SEVERITY) as IssueSeverity[]).map((k) => (
          <option key={k} value={k}>
            {ISSUE_SEVERITY[k].label}
          </option>
        ))}
      </select>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What happened?"
        className="w-56 rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Issue title"
      />
      <label className="flex items-center gap-1.5 text-xs text-ink2">
        identified
        <input
          type="date"
          value={identified}
          onChange={(e) => setIdentified(e.target.value)}
          className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
          aria-label="Identified date"
          required
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-ink2">
        due
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
          aria-label="Due date (optional)"
        />
      </label>
      <button
        type="submit"
        disabled={create.isPending || !title}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
      >
        <Plus size={12} aria-hidden />
        {create.isPending ? "Logging…" : "Log issue"}
      </button>
      <ErrorNote error={err} className="w-full" />
    </form>
  );
}

export function EnrollmentBars({ rows }: { rows: SiteEnrollment[] }) {
  return (
    <ul className="divide-y divide-hairline">
      {rows.map((r) => {
        const pct =
          r.pct_of_target === null ? null : Math.min(100, Number(r.pct_of_target));
        return (
          <li key={r.study_site_id} className="flex items-center gap-3 px-4 py-2.5">
            <Link to={`/sites/${r.study_site_id}`} className="w-28 shrink-0 text-sm hover:underline">
              Site {r.site_number}
            </Link>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-page">
              {pct !== null && (
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background:
                      pct >= 75 ? "var(--status-good)" : pct >= 40 ? "var(--status-warn)" : "var(--status-critical)",
                  }}
                />
              )}
            </div>
            <span className="w-40 shrink-0 text-right text-xs text-ink2">
              {r.enrolled === null
                ? "no report yet"
                : `${r.enrolled} / ${r.target_enrollment ?? "?"} enrolled${
                    r.as_of_date ? ` · ${r.as_of_date}` : ""
                  }`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ScheduleVisitForm({
  studyId,
  studySiteId,
}: {
  studyId: string;
  studySiteId: string;
}) {
  const schedule = useScheduleVisit(studyId);
  const { data: me } = useMe();
  const [type, setType] = useState<VisitType>("interim");
  const [date, setDate] = useState("");
  const [err, setErr] = useState<unknown>(null);
  if (!can(me, "upload")) return null;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!date) return;
        setErr(null);
        schedule.mutate(
          { studySiteId, visitType: type, scheduledDate: date },
          { onError: (e) => setErr(e), onSuccess: () => setDate("") },
        );
      }}
    >
      <select
        value={type}
        onChange={(e) => setType(e.target.value as VisitType)}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Visit type"
      >
        {Object.entries(VISIT_TYPE_LABEL).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Scheduled date"
        required
      />
      <button
        type="submit"
        disabled={schedule.isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
      >
        <CalendarPlus size={12} aria-hidden />
        {schedule.isPending ? "Scheduling…" : "Schedule visit"}
      </button>
      <ErrorNote error={err} />
    </form>
  );
}

export function ReportEnrollmentForm({
  studySiteId,
  latest,
}: {
  studySiteId: string;
  latest: SiteEnrollment | undefined;
}) {
  const report = useReportEnrollment();
  const { data: me } = useMe();
  const [counts, setCounts] = useState({
    screened: latest?.screened ?? 0,
    enrolled: latest?.enrolled ?? 0,
    withdrawn: latest?.withdrawn ?? 0,
    completed: latest?.completed ?? 0,
  });
  const [err, setErr] = useState<unknown>(null);
  if (!can(me, "upload")) return null;
  const field = (key: keyof typeof counts, label: string) => (
    <label className="flex items-center gap-1.5 text-xs text-ink2">
      {label}
      <input
        type="number"
        min={0}
        value={counts[key]}
        onChange={(e) => setCounts((c) => ({ ...c, [key]: Number(e.target.value) }))}
        className="w-16 rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
      />
    </label>
  );
  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        report.mutate(
          {
            studySiteId,
            asOfDate: localToday(),
            ...counts,
          },
          { onError: (e) => setErr(e) },
        );
      }}
    >
      {field("screened", "screened")}
      {field("enrolled", "enrolled")}
      {field("withdrawn", "withdrawn")}
      {field("completed", "completed")}
      <button
        type="submit"
        disabled={report.isPending}
        className="rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
      >
        {report.isPending ? "Reporting…" : "Report as of today"}
      </button>
      <ErrorNote error={err} className="w-full" />
    </form>
  );
}
