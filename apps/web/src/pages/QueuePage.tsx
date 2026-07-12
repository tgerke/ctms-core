import { CircleAlert, CircleDashed, UserCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useAssignReview,
  usePeople,
  useReviewQueue,
  type QueueEntry,
  type QueueStatus,
  type Study,
} from "../api";
import { ErrorNote, PageState } from "../ops";
import { SpecChip, type StatusSpec } from "../status";

// The review queue (ADR-0018): every document awaiting review, its latest
// version's current assignment, and a derived status. Approving or returning
// a version is what empties the queue — nothing here marks work "done".

const QUEUE_STATUS: Record<QueueStatus, Omit<StatusSpec, "rank">> = {
  overdue: { label: "Overdue", icon: CircleAlert, cssVar: "--status-critical" },
  unassigned: { label: "Unassigned", icon: CircleDashed, cssVar: "--status-warn", hollow: true },
  assigned: { label: "Assigned", icon: UserCheck, cssVar: "--info" },
};

export default function QueuePage({ study }: { study: Study | undefined }) {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as QueueStatus | null) ?? undefined;
  const assignedTo = params.get("assigned_to") ?? undefined;
  const queueQuery = useReviewQueue(study?.id, { status, assignedTo });
  const { data: people } = usePeople();

  const setParam = (key: string, value: string | undefined) => {
    setParams(
      (p) => {
        if (value === undefined || p.get(key) === value) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );
  };

  if (!study) return <PageState query={{ isPending: true, isError: false, error: null }} label="study" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Review queue</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink2">
          Every document awaiting review for {study.protocol_number}, with its
          current assignment. Approving or returning a version is what clears
          it from this list — there is no "mark done".
        </p>
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
          <h2 className="font-medium">Pending review</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {(Object.keys(QUEUE_STATUS) as QueueStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setParam("status", s)}
                className={status && status !== s ? "opacity-40" : ""}
                aria-pressed={status === s}
              >
                <SpecChip spec={QUEUE_STATUS[s]} />
              </button>
            ))}
            <select
              value={assignedTo ?? ""}
              onChange={(e) => setParam("assigned_to", e.target.value || undefined)}
              className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
              aria-label="Filter by assignee"
            >
              <option value="">Any assignee</option>
              {people?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.family_name}, {p.given_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {queueQuery.data?.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">
            Nothing awaiting review{status || assignedTo ? " matches the filter" : ""}.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {queueQuery.data?.map((q) => (
              <QueueRow key={q.document_version_id} q={q} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function QueueRow({ q }: { q: QueueEntry }) {
  const assign = useAssignReview();
  const { data: people } = usePeople();
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [err, setErr] = useState<unknown>(null);

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="mono text-xs text-muted">{q.artifact_code}</span>
        <Link to={`/documents/${q.document_id}`} className="text-sm hover:underline">
          {q.title}
        </Link>
        <span className="text-xs text-muted">
          v{q.version_number}
          {q.site_number ? ` · Site ${q.site_number}` : " · study-level"}
          {q.uploader_family_name
            ? ` · uploaded by ${q.uploader_given_name} ${q.uploader_family_name}`
            : ""}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {!open && (
            <button
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page"
            >
              <UserPlus size={12} aria-hidden />
              {q.assignment_id ? "Reassign" : "Assign"}
            </button>
          )}
          <SpecChip spec={QUEUE_STATUS[q.queue_status]} />
        </span>
      </div>
      {q.assignment_id && (
        <div className="mt-0.5 text-xs text-ink2">
          ↳ assigned to {q.assignee_given_name} {q.assignee_family_name}
          {q.due_date ? ` · due ${q.due_date}` : ""} · by {q.assigner_given_name}{" "}
          {q.assigner_family_name}
          {q.note ? ` — ${q.note}` : ""}
        </div>
      )}
      {open && (
        <form
          className="mt-1.5 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!assignee) return;
            setErr(null);
            assign.mutate(
              {
                versionId: q.document_version_id,
                assigneePersonId: assignee,
                dueDate: due || undefined,
              },
              {
                onError: (e) => setErr(e),
                onSuccess: () => {
                  setOpen(false);
                  setAssignee("");
                  setDue("");
                },
              },
            );
          }}
        >
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
            aria-label="Reviewer"
          >
            <option value="">Reviewer…</option>
            {people?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.family_name}, {p.given_name}
              </option>
            ))}
          </select>
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
            disabled={assign.isPending || !assignee}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
          >
            <UserPlus size={12} aria-hidden />
            {assign.isPending ? "Assigning…" : "Assign review"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-muted hover:underline"
          >
            cancel
          </button>
          <span className="text-xs text-muted">
            The reviewer must hold approval authority for this document.
          </span>
          <ErrorNote error={err} className="w-full" />
        </form>
      )}
    </li>
  );
}
