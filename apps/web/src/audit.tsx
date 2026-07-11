import type { AuditEvent } from "./api";

const fmtTime = (t: string) => new Date(t).toLocaleString();

/** Append-only audit rows with hash-chain fragments; used per-document and globally. */
export function AuditEventList({ events }: { events: AuditEvent[] | undefined }) {
  return (
    <ol className="divide-y divide-hairline">
      {events?.map((e) => (
        <li key={String(e.id)} className="px-4 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-3">
            <span className="mono text-xs text-muted">#{e.id}</span>
            <span className="rounded bg-page px-1.5 py-0.5 text-xs font-medium">
              {e.action}
            </span>
            <span className="text-xs text-ink2">
              {e.actor_given_name
                ? `${e.actor_given_name} ${e.actor_family_name}`
                : e.actor_label}
            </span>
            <span className="text-xs text-muted">{fmtTime(e.occurred_at)}</span>
            <span className="text-xs text-muted">
              {e.entity_type.replace(/_/g, " ")}
            </span>
            <span
              className="mono ml-auto text-xs text-muted"
              title={`Each entry is chained to the one before it (prev ${e.prev_hash}) — a break in the chain means the trail was altered.`}
            >
              {e.prev_hash.slice(0, 8)} → {e.hash.slice(0, 8)}
            </span>
          </div>
          {(e.before || e.after) && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-muted">
                what changed
              </summary>
              <pre className="mono mt-1 overflow-x-auto rounded bg-page p-2 text-xs text-ink2">
                {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
              </pre>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}
