import {
  Archive,
  Check,
  CircleDashed,
  Clock,
  Hourglass,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ExpectedStatus } from "./api";

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
  pending_review: {
    label: "Pending review",
    rank: 2,
    icon: Hourglass,
    cssVar: "--info",
  },
  expiring_soon: {
    label: "Expiring soon",
    rank: 3,
    icon: Clock,
    cssVar: "--status-warn",
  },
  superseded: { label: "Superseded", rank: 4, icon: Archive, cssVar: "--muted" },
  current: { label: "Current", rank: 5, icon: Check, cssVar: "--status-good" },
};

export const worst = (statuses: ExpectedStatus[]): ExpectedStatus =>
  statuses.reduce((a, b) => (STATUS[a].rank <= STATUS[b].rank ? a : b));

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
