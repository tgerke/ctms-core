import {
  AlertTriangle,
  Archive,
  CalendarClock,
  Check,
  CircleAlert,
  CircleDashed,
  CircleDot,
  CircleSlash,
  Clock,
  FileClock,
  Hourglass,
  ListChecks,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ExpectedStatus, IssueSeverity, IssueStatus, VisitStage } from "./api";

/** Status is never color-alone: every rendering pairs icon + label or tooltip. */
export interface StatusSpec {
  label: string;
  rank: number; // 0 = worst; grid cells aggregate to the minimum rank
  icon: LucideIcon;
  cssVar: string; // color custom property
  hollow?: boolean; // "missing" renders as absence: dashed outline, no fill
}

export const STATUS: Record<ExpectedStatus, StatusSpec> = {
  missing: {
    label: "Missing",
    rank: 0,
    icon: CircleDashed,
    cssVar: "--muted",
    hollow: true,
  },
  expired: { label: "Expired", rank: 1, icon: X, cssVar: "--status-critical" },
  returned: {
    label: "Returned",
    rank: 2,
    icon: Undo2,
    cssVar: "--status-serious",
  },
  pending_review: {
    label: "Pending review",
    rank: 3,
    icon: Hourglass,
    cssVar: "--info",
  },
  expiring_soon: {
    label: "Expiring soon",
    rank: 4,
    icon: Clock,
    cssVar: "--status-warn",
  },
  superseded: { label: "Superseded", rank: 5, icon: Archive, cssVar: "--muted" },
  current: { label: "Current", rank: 6, icon: Check, cssVar: "--status-good" },
  // Waived reads as satisfied-by-explanation (ADR-0016): it never drags an
  // aggregate cell down, so it ranks past 'current'.
  waived: { label: "Waived", rank: 7, icon: CircleSlash, cssVar: "--muted" },
};

export const worst = (statuses: ExpectedStatus[]): ExpectedStatus =>
  statuses.reduce((a, b) => (STATUS[a].rank <= STATUS[b].rank ? a : b));

/** Visit lifecycle stages: derived by v_monitoring_visit_status, never stored. */
export const VISIT_STAGE: Record<VisitStage, Omit<StatusSpec, "rank">> = {
  overdue: { label: "Overdue", icon: CircleAlert, cssVar: "--status-critical" },
  awaiting_report: { label: "Awaiting report", icon: FileClock, cssVar: "--status-warn" },
  report_pending_review: { label: "Report in review", icon: Hourglass, cssVar: "--info" },
  follow_up: { label: "Follow-up", icon: ListChecks, cssVar: "--status-warn" },
  scheduled: { label: "Scheduled", icon: CalendarClock, cssVar: "--muted", hollow: true },
  complete: { label: "Complete", icon: Check, cssVar: "--status-good" },
};

/** Delegation entries (ADR-0023): active/ended, derived from dated facts.
 * Training statuses reuse STATUS — current/expiring_soon/expired are shared. */
export const DELEGATION_STATUS: Record<"active" | "ended", Omit<StatusSpec, "rank">> = {
  active: { label: "Active", icon: Check, cssVar: "--status-good" },
  ended: { label: "Ended", icon: Archive, cssVar: "--muted" },
};

export const ISSUE_STATUS: Record<IssueStatus, Omit<StatusSpec, "rank">> = {
  overdue: { label: "Overdue", icon: CircleAlert, cssVar: "--status-critical" },
  open: { label: "Open", icon: CircleDot, cssVar: "--status-warn" },
  resolved: { label: "Resolved", icon: Check, cssVar: "--status-good" },
};

export const ISSUE_SEVERITY: Record<IssueSeverity, Omit<StatusSpec, "rank">> = {
  critical: { label: "Critical", icon: AlertTriangle, cssVar: "--status-critical" },
  major: { label: "Major", icon: AlertTriangle, cssVar: "--status-warn" },
  minor: { label: "Minor", icon: AlertTriangle, cssVar: "--muted" },
};

/** Generic chip for any Omit<StatusSpec, "rank">-shaped spec (visits, issues). */
export function SpecChip({ spec }: { spec: Omit<StatusSpec, "rank"> }) {
  const Icon = spec.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{
        color: `var(${spec.cssVar})`,
        borderColor: `color-mix(in srgb, var(${spec.cssVar}) 40%, transparent)`,
        background: spec.hollow
          ? "transparent"
          : `color-mix(in srgb, var(${spec.cssVar}) 12%, transparent)`,
      }}
    >
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      <span className="text-ink2">{spec.label}</span>
    </span>
  );
}

export function StatusChip({ status }: { status: ExpectedStatus }) {
  const spec = STATUS[status];
  const Icon = spec.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{
        color: `var(${spec.cssVar})`,
        borderColor: `color-mix(in srgb, var(${spec.cssVar}) 40%, transparent)`,
        background: spec.hollow
          ? "transparent"
          : `color-mix(in srgb, var(${spec.cssVar}) 12%, transparent)`,
      }}
    >
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      <span className="text-ink2">{spec.label}</span>
    </span>
  );
}

export function StatusCell({
  status,
  count,
  title,
}: {
  status: ExpectedStatus;
  count?: number;
  title: string;
}) {
  const spec = STATUS[status];
  const Icon = spec.icon;
  return (
    <span
      title={title}
      aria-label={title}
      className="relative inline-flex h-7 w-7 items-center justify-center rounded-md"
      style={
        spec.hollow
          ? { border: `1.5px dashed var(${spec.cssVar})`, color: `var(${spec.cssVar})` }
          : {
              background: `color-mix(in srgb, var(${spec.cssVar}) 16%, transparent)`,
              color: `var(${spec.cssVar})`,
              border: `1px solid color-mix(in srgb, var(${spec.cssVar}) 35%, transparent)`,
            }
      }
    >
      <Icon size={14} strokeWidth={2.5} aria-hidden />
      {count !== undefined && count > 1 && (
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-surface px-1 text-[10px] font-semibold text-ink2 ring-1 ring-ring2 mono">
          {count}
        </span>
      )}
    </span>
  );
}
