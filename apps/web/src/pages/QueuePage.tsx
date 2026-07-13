import {
  CircleAlert,
  CircleDashed,
  CornerUpLeft,
  Download,
  Eye,
  PenLine,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useAssignReview,
  useBulkApprove,
  useBulkReturn,
  usePeople,
  useReviewQueue,
  useVersionContent,
  type QueueEntry,
  type QueueStatus,
  type Study,
} from "../api";
import { ErrorNote, PageState } from "../ops";
import { SpecChip, type StatusSpec } from "../status";

// The review queue (ADR-0018): every document awaiting review, its latest
// version's current assignment, and a derived status. Approving or returning
// a version is what empties the queue — nothing here marks work "done".
// Bulk review (ADR-0026) acts on a checkbox selection: approval is one
// §11.200(a)(1)(i) series of signings, return shares one documented reason.
// Preview (ADR-0027) opens the version's bytes inline, so reading what you
// are about to sign doesn't cost a page per document.

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // One preview open at a time: switching rows swaps the panel, like paging
  // through the stack of pending documents.
  const [previewId, setPreviewId] = useState<string | null>(null);

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

  const visibleIds = (queueQuery.data ?? []).map((q) => q.document_version_id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(visibleIds))
            }
            aria-label={allSelected ? "Clear selection" : "Select all listed"}
          />
          <h2 className="-ml-2 font-medium">Pending review</h2>
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
        {selected.size > 0 && (
          <BulkBar
            selected={selected}
            clear={() => setSelected(new Set())}
          />
        )}
        {queueQuery.data?.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">
            Nothing awaiting review{status || assignedTo ? " matches the filter" : ""}.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {queueQuery.data?.map((q) => (
              <QueueRow
                key={q.document_version_id}
                q={q}
                checked={selected.has(q.document_version_id)}
                toggle={() => toggle(q.document_version_id)}
                previewing={previewId === q.document_version_id}
                togglePreview={() =>
                  setPreviewId((id) =>
                    id === q.document_version_id ? null : q.document_version_id,
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Actions over the selection. Approval is one signature ceremony for the
 * series — one re-authentication, then one signature per version, each bound
 * to its own content hash. The server refuses the whole selection, listing
 * every blocker, if anything in it is not reviewable.
 */
function BulkBar({ selected, clear }: { selected: Set<string>; clear: () => void }) {
  const approve = useBulkApprove();
  const bulkReturn = useBulkReturn();
  const [mode, setMode] = useState<"idle" | "approve" | "return">("idle");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const n = selected.size;
  const done = () => {
    setMode("idle");
    setReason("");
    setErr(null);
    clear();
  };

  return (
    <div className="border-b border-hairline bg-page px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink2">
          {n} selected — review as a batch: approve is one signature ceremony
          ({n} signature{n === 1 ? "" : "s"}, each bound to its version's hash),
          return shares one reason.
        </span>
        <span className="ml-auto flex items-center gap-2">
          {mode !== "approve" && (
            <button
              onClick={() => setMode("approve")}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-surface"
            >
              <PenLine size={12} aria-hidden />
              Approve {n}…
            </button>
          )}
          {mode !== "return" && (
            <button
              onClick={() => setMode("return")}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-surface"
            >
              <CornerUpLeft size={12} aria-hidden />
              Return {n}…
            </button>
          )}
          <button onClick={done} className="text-xs text-muted hover:underline">
            clear
          </button>
        </span>
      </div>
      {mode === "approve" && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink2">
            Sign approval for {n} document{n === 1 ? "" : "s"}? You will
            re-authenticate once for the series (§11.200).
          </span>
          <button
            onClick={() => {
              setErr(null);
              approve.mutate(
                { versionIds: [...selected] },
                { onError: setErr, onSuccess: done },
              );
            }}
            disabled={approve.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs font-medium text-ink2 hover:bg-surface disabled:opacity-50"
          >
            <PenLine size={12} aria-hidden />
            {approve.isPending ? "Signing…" : `Sign ${n} approval${n === 1 ? "" : "s"}`}
          </button>
          <button onClick={() => setMode("idle")} className="text-xs text-muted hover:underline">
            cancel
          </button>
        </div>
      )}
      {mode === "return" && (
        <form
          className="mt-1.5 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            setErr(null);
            bulkReturn.mutate(
              { versionIds: [...selected], reason: reason.trim() },
              { onError: setErr, onSuccess: done },
            );
          }}
        >
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason, recorded immutably on every returned version…"
            className="w-72 rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
            aria-label="Return reason"
          />
          <button
            type="submit"
            disabled={bulkReturn.isPending || !reason.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-surface disabled:opacity-50"
          >
            <CornerUpLeft size={12} aria-hidden />
            {bulkReturn.isPending ? "Returning…" : `Return ${n}`}
          </button>
          <button type="button" onClick={() => setMode("idle")} className="text-xs text-muted hover:underline">
            cancel
          </button>
        </form>
      )}
      <ErrorNote error={err} className="mt-1 w-full" />
    </div>
  );
}

function QueueRow({
  q,
  checked,
  toggle,
  previewing,
  togglePreview,
}: {
  q: QueueEntry;
  checked: boolean;
  toggle: () => void;
  previewing: boolean;
  togglePreview: () => void;
}) {
  const assign = useAssignReview();
  const { data: people } = usePeople();
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [err, setErr] = useState<unknown>(null);

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={toggle}
          aria-label={`Select ${q.title} v${q.version_number}`}
        />
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
          <button
            onClick={togglePreview}
            aria-expanded={previewing}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page"
          >
            <Eye size={12} aria-hidden />
            {previewing ? "Close preview" : "Preview"}
          </button>
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
      {previewing && <PreviewPanel versionId={q.document_version_id} />}
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

/**
 * Inline view of the version awaiting review (ADR-0027): the exact immutable
 * bytes an approval signature would hash, fetched with the session credential
 * — there is no separate preview rendition to drift from the record. PDFs and
 * images render natively, text renders as text, anything else offers the
 * download.
 */
function PreviewPanel({ versionId }: { versionId: string }) {
  const { isPending, error, url, mime, fileName, text } = useVersionContent(versionId);
  if (isPending) return <p className="mt-2 text-xs text-muted">Loading document…</p>;
  if (error) return <ErrorNote error={error} className="mt-2" />;
  if (!url) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="mono">{fileName}</span>
        <a
          href={url}
          download={fileName}
          className="inline-flex items-center gap-1 hover:underline"
        >
          <Download size={11} aria-hidden />
          download
        </a>
      </div>
      {mime === "application/pdf" ? (
        <iframe
          src={url}
          title={fileName}
          className="h-[28rem] w-full rounded-md border border-hairline bg-surface"
        />
      ) : mime?.startsWith("image/") ? (
        <img
          src={url}
          alt={fileName}
          className="max-h-[28rem] max-w-full rounded-md border border-hairline"
        />
      ) : text !== null ? (
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md border border-hairline bg-surface p-3 text-xs">
          {text}
        </pre>
      ) : (
        <p className="text-xs text-muted">
          No inline view for {mime ?? "this file type"} — use the download link
          above.
        </p>
      )}
    </div>
  );
}
