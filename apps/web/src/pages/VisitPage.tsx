import { ArrowLeft, CheckCircle2, ClipboardList, FileUp, PenLine } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCreateActionItem,
  useResolveActionItem,
  useSign,
  useUpdateVisit,
  useVisit,
  useVisitUpload,
} from "../api";
import { ISSUE_SEVERITY, ISSUE_STATUS, SpecChip, VISIT_STAGE } from "../status";
import { ErrorNote, NewIssueForm, PageState, VISIT_TYPE_LABEL, localToday } from "../ops";

export default function VisitPage() {
  const { visitId } = useParams();
  const visitQuery = useVisit(visitId);
  const detail = visitQuery.data;
  const update = useUpdateVisit();
  const [err, setErr] = useState<unknown>(null);

  if (!detail) return <PageState query={visitQuery} label="visit" />;
  const v = detail.visit;
  const tripReport = detail.documents.find((d) => d.link_kind === "trip_report");

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/sites/${v.study_site_id}`}
          className="inline-flex items-center gap-1 text-sm text-ink2 hover:underline"
        >
          <ArrowLeft size={14} aria-hidden /> Site {v.site_number} — {v.site_name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">
            {VISIT_TYPE_LABEL[v.visit_type]} monitoring visit
          </h1>
          <SpecChip spec={VISIT_STAGE[v.stage]} />
        </div>
        <div className="mt-1 text-sm text-ink2">
          scheduled {v.scheduled_date}
          {v.visit_date ? ` · conducted ${v.visit_date}` : ""}
          {v.monitor_family_name
            ? ` · monitor ${v.monitor_given_name} ${v.monitor_family_name}`
            : ""}
        </div>
        {v.summary && <p className="mt-2 max-w-3xl text-sm text-ink2">{v.summary}</p>}
        {!v.visit_date && (
          <button
            onClick={() => {
              setErr(null);
              update.mutate(
                { visitId: v.monitoring_visit_id, visitDate: localToday() },
                { onError: (e) => setErr(e) },
              );
            }}
            disabled={update.isPending}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs text-ink2 hover:bg-page disabled:opacity-50"
          >
            <ClipboardList size={13} aria-hidden />
            {update.isPending ? "Recording…" : "Record as conducted today"}
          </button>
        )}
        <ErrorNote error={err} className="mt-1" />
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
          <h2 className="font-medium">Trip report & letters</h2>
          {v.visit_date && !tripReport && <TripReportUpload visitId={v.monitoring_visit_id} siteNumber={v.site_number} visitType={v.visit_type} />}
        </div>
        {detail.documents.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">
            {v.visit_date
              ? "No trip report yet — upload one to advance the visit."
              : "Documents attach once the visit is conducted."}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {detail.documents.map((d) => (
              <li key={d.document_id} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5">
                <span className="rounded bg-page px-1.5 py-0.5 text-xs font-medium">
                  {d.link_kind.replace(/_/g, " ")}
                </span>
                <Link to={`/documents/${d.document_id}`} className="text-sm hover:underline">
                  {d.title}
                </Link>
                <span className="ml-auto inline-flex items-center gap-2 text-xs text-ink2">
                  {d.status === "pending_review" && (
                    <Link
                      to={`/documents/${d.document_id}`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-white"
                      style={{ background: "var(--info)" }}
                    >
                      <PenLine size={12} aria-hidden /> Review & approve
                    </Link>
                  )}
                  {d.status.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
          <h2 className="font-medium">Action items</h2>
          <span className="text-xs text-muted">
            {v.open_action_items} open of {v.total_action_items}
          </span>
          <div className="ml-auto">
            <AddActionItemForm visitId={v.monitoring_visit_id} />
          </div>
        </div>
        {detail.actionItems.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No action items.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {detail.actionItems.map((ai) => (
              <ActionItemRow key={ai.id} item={ai} />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">
          Issues raised at this visit
        </h2>
        {detail.issues.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No issues linked to this visit.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {detail.issues.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5">
                <SpecChip spec={ISSUE_SEVERITY[i.severity]} />
                <span className="text-sm">{i.title}</span>
                <span className="ml-auto">
                  <SpecChip spec={ISSUE_STATUS[i.status]} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-hairline px-4 py-3">
          <NewIssueForm
            studyId={v.study_id}
            studySiteId={v.study_site_id}
            monitoringVisitId={v.monitoring_visit_id}
          />
        </div>
      </section>
    </div>
  );
}

function TripReportUpload({
  visitId,
  siteNumber,
  visitType,
}: {
  visitId: string;
  siteNumber: string;
  visitType: string;
}) {
  const upload = useVisitUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="ml-auto">
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
              visitId,
              file,
              title: `${VISIT_TYPE_LABEL[visitType as keyof typeof VISIT_TYPE_LABEL]} Visit Trip Report — Site ${siteNumber}`,
              linkKind: "trip_report",
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
        <FileUp size={12} aria-hidden />
        {upload.isPending ? "Uploading…" : "Upload trip report"}
      </button>
      <ErrorNote error={err} />
    </div>
  );
}

function AddActionItemForm({ visitId }: { visitId: string }) {
  const create = useCreateActionItem();
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [err, setErr] = useState<unknown>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!description) return;
        setErr(null);
        create.mutate(
          { visitId, description, dueDate: due || undefined },
          {
            onError: (e) => setErr(e),
            onSuccess: () => {
              setDescription("");
              setDue("");
            },
          },
        );
      }}
    >
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="New action item…"
        className="w-48 rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Action item description"
      />
      <input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        aria-label="Due date"
      />
      <button
        type="submit"
        disabled={create.isPending || !description}
        className="rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
      >
        {create.isPending ? "Adding…" : "Add"}
      </button>
      <ErrorNote error={err} />
    </form>
  );
}

function ActionItemRow({
  item,
}: {
  item: {
    id: string;
    description: string;
    due_date: string | null;
    resolved_at: string | null;
    resolved_by_given_name: string | null;
    resolved_by_family_name: string | null;
    resolution_note: string | null;
    status: "open" | "overdue" | "resolved";
  };
}) {
  const resolve = useResolveActionItem();
  const [err, setErr] = useState<unknown>(null);
  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3">
        <span className="text-sm">{item.description}</span>
        <span className="ml-auto flex items-center gap-2">
          {item.status !== "resolved" && (
            <button
              onClick={() => {
                setErr(null);
                resolve.mutate(
                  { actionItemId: item.id },
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
          <SpecChip spec={ISSUE_STATUS[item.status]} />
        </span>
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {item.due_date && !item.resolved_at ? `due ${item.due_date}` : ""}
        {item.resolved_at
          ? `resolved ${item.resolved_at}${
              item.resolved_by_family_name
                ? ` by ${item.resolved_by_given_name} ${item.resolved_by_family_name}`
                : ""
            }`
          : ""}
        {item.resolution_note ? ` — ${item.resolution_note}` : ""}
      </div>
      <ErrorNote error={err} className="mt-1" />
    </li>
  );
}
