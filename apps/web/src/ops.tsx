import { CalendarPlus, CheckCircle2, Flag } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useReportEnrollment,
  useResolveIssue,
  useScheduleVisit,
  type Issue,
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
  const [err, setErr] = useState<string | null>(null);
  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SpecChip spec={ISSUE_SEVERITY[issue.severity]} />
        <span className="text-sm">{issue.title}</span>
        <span className="ml-auto flex items-center gap-2">
          {issue.status !== "resolved" && (
            <button
              onClick={() => {
                setErr(null);
                resolve.mutate(
                  { issueId: issue.id },
                  { onError: (e) => setErr(String(e)) },
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
      {err && <div className="mt-1 text-xs" style={{ color: "var(--status-critical)" }}>{err}</div>}
    </li>
  );
}

export function MilestoneStrip({ milestones }: { milestones: Milestone[] }) {
  return (
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
          </li>
        );
      })}
    </ol>
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
  const [type, setType] = useState<VisitType>("interim");
  const [date, setDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!date) return;
        setErr(null);
        schedule.mutate(
          { studySiteId, visitType: type, scheduledDate: date },
          { onError: (e) => setErr(String(e)), onSuccess: () => setDate("") },
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
      {err && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{err}</span>}
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
  const [counts, setCounts] = useState({
    screened: latest?.screened ?? 0,
    enrolled: latest?.enrolled ?? 0,
    withdrawn: latest?.withdrawn ?? 0,
    completed: latest?.completed ?? 0,
  });
  const [err, setErr] = useState<string | null>(null);
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
            asOfDate: new Date().toISOString().slice(0, 10),
            ...counts,
          },
          { onError: (e) => setErr(String(e)) },
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
      {err && <span className="w-full text-xs" style={{ color: "var(--status-critical)" }}>{err}</span>}
    </form>
  );
}
