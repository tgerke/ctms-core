import { useMemo, useState } from "react";
import { useAuditEvents } from "../api";
import { AuditEventList } from "../audit";
import { PageState } from "../ops";

export default function AuditPage() {
  const auditQuery = useAuditEvents({ limit: 500 });
  const events = auditQuery.data;
  const [entityType, setEntityType] = useState("");
  // Filter options come from the events themselves, not a hardcoded list.
  const types = useMemo(
    () => [...new Set((events ?? []).map((e) => e.entity_type))].sort(),
    [events],
  );
  const shown = entityType
    ? events?.filter((e) => e.entity_type === entityType)
    : events;

  if (!events) return <PageState query={auditQuery} label="audit trail" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Audit trail</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink2">
          Every change in the system — uploads, approvals, corrections — is
          recorded here automatically. Entries can never be edited or deleted,
          and each one is chained to the one before it, so any tampering would
          be detectable. Showing the most recent {events.length} events.
        </p>
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
          <h2 className="font-medium">Events</h2>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="ml-auto rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
            aria-label="Filter by record type"
          >
            <option value="">All record types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        {shown?.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No events of this type.</p>
        ) : (
          <AuditEventList events={shown} />
        )}
      </section>
    </div>
  );
}
