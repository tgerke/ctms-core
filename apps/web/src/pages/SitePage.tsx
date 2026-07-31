import {
  ArrowLeft,
  CircleSlash,
  ClipboardList,
  GraduationCap,
  PenLine,
  Undo2,
  Upload,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  can,
  isSiteSeat,
  useAssignSiteRole,
  useCreateDelegation,
  useCreateScreeningEntry,
  useDelegationLog,
  useEndDelegation,
  useEndSiteRole,
  useIssues,
  useMe,
  usePeople,
  useRecordScreeningOutcome,
  useRecordTraining,
  useRevokeWaiver,
  useScreeningLog,
  useScreeningSummary,
  useSignLogEntry,
  useSiteEnrollment,
  useSiteExpected,
  useSiteOverview,
  useStaff,
  useSyncExpected,
  useTrainingLog,
  useUpload,
  useVisits,
  useWaive,
  type Delegation,
  type ExpectedDocument,
  type LogEntryKind,
  type LogSignature,
  type ScreeningEntry,
  type StaffMember,
  type StaffRole,
  type Study,
  type TrainingRecord,
} from "../api";
import {
  buttonCls,
  EnrollmentBars,
  ErrorNote,
  fieldCls,
  inputCls,
  IssueListItem,
  localToday,
  NewIssueForm,
  PageState,
  ReportEnrollmentForm,
  ScheduleVisitForm,
  VisitListItem,
} from "../ops";
import { DELEGATION_STATUS, SCREENING_STATUS, SpecChip, StatusChip } from "../status";

const ROLE_LABEL: Record<string, string> = {
  principal_investigator: "Principal Investigator",
  sub_investigator: "Sub-Investigator",
  study_coordinator: "Study Coordinator",
  pharmacist: "Pharmacist",
  research_nurse: "Research Nurse",
};

export default function SitePage({ study }: { study: Study | undefined }) {
  const { studySiteId } = useParams();
  const { data: me } = useMe();
  // The site seat (ADR-0023) reads only site-scoped endpoints; study-wide
  // sections (visits, issues) are the oversight seat's and stay hidden.
  const siteSeat = isSiteSeat(me);
  // Oversight-only queries wait for /me so a site persona never fires them.
  const oversightStudyId = me && !siteSeat ? study?.id : undefined;
  const overviewQuery = useSiteOverview(studySiteId);
  const site = overviewQuery.data;
  const { data: expected } = useSiteExpected(studySiteId);
  const { data: staff } = useStaff(studySiteId);
  const { data: visits } = useVisits(oversightStudyId, { studySiteId });
  const { data: issues } = useIssues(oversightStudyId, { studySiteId });
  const { data: enrollment } = useSiteEnrollment(studySiteId);

  const byZone = useMemo(() => {
    const zones = new Map<string, ExpectedDocument[]>();
    for (const r of expected ?? []) {
      const key = `${String(r.zone_number).padStart(2, "0")} ${r.zone_name}`;
      zones.set(key, [...(zones.get(key) ?? []), r]);
    }
    return zones;
  }, [expected]);

  if (!site) return <PageState query={overviewQuery} label="site" />;

  // In-page jump nav: the page is deliberately one continuous record, so give
  // it a section index instead of tabs. Entries mirror section visibility.
  const jumpLinks: { href: string; label: string }[] = [
    { href: "#staff", label: "Staff" },
    { href: "#delegation", label: "Delegation" },
    { href: "#training", label: "Training" },
    { href: "#screening", label: "Screening" },
    ...(me && !siteSeat && study
      ? [
          { href: "#visits", label: "Visits" },
          { href: "#issues", label: "Issues" },
        ]
      : []),
    { href: "#enrollment", label: "Enrollment" },
    { href: "#documents", label: "Documents" },
  ];

  return (
    <div className="space-y-6">
      <div>
        {siteSeat ? (
          <span className="text-sm text-ink2">
            {site.protocol_number} · your site
          </span>
        ) : (
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink2 hover:underline">
            <ArrowLeft size={14} aria-hidden /> {site.protocol_number}
          </Link>
        )}
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

      {/* Sticky under the app header at xl, where the header is reliably one
          55px line; below that it stays a plain index at the top. */}
      <nav
        className="-mx-4 flex flex-wrap items-center gap-1 border-b border-hairline bg-page/90 px-4 py-2 backdrop-blur xl:sticky xl:top-[57px] xl:z-[5]"
        aria-label="Page sections"
      >
        {jumpLinks.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="rounded-md px-2 py-1 text-xs text-ink2 hover:bg-surface"
          >
            {l.label}
          </a>
        ))}
      </nav>

      <section id="staff" className="card scroll-mt-28">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">Staff</h2>
        <ul className="divide-y divide-hairline">
          {staff?.map((m) => (
            // Grant-aware rendering (ADR-0028): staffing changes are admin work.
            <StaffRow key={m.role_id} m={m} readOnly={!can(me, "administer")} />
          ))}
        </ul>
        {can(me, "administer") && study && (
          <div className="border-t border-hairline px-4 py-3">
            <AddStaffForm studyId={study.id} studySiteId={site.study_site_id} />
          </div>
        )}
      </section>

      <section id="delegation" className="card scroll-mt-28">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">
          Delegation of authority{" "}
          <span className="text-xs font-normal text-muted">
            structured entries beside the signed DoA log (ADR-0023)
          </span>
        </h2>
        <DelegationLog studySiteId={site.study_site_id} staff={staff} />
      </section>

      <section id="training" className="card scroll-mt-28">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">
          Training log{" "}
          <span className="text-xs font-normal text-muted">
            dated facts; expiry is derived, never stored
          </span>
        </h2>
        <TrainingLog studySiteId={site.study_site_id} staff={staff} />
      </section>

      <section id="screening" className="card scroll-mt-28">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">
          Screening log{" "}
          <span className="text-xs font-normal text-muted">
            pseudonymous numbers and dated dispositions; no clinical data (ADR-0036)
          </span>
        </h2>
        <ScreeningLog studySiteId={site.study_site_id} />
      </section>

      {me && !siteSeat && study && (
        <section id="visits" className="card scroll-mt-28">
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
      )}

      {me && !siteSeat && study && (
        <section id="issues" className="card scroll-mt-28">
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
      )}

      <section id="enrollment" className="card scroll-mt-28">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">
          Enrollment{" "}
          <span className="text-xs font-normal text-muted">
            as-reported aggregates; corrections are audited
          </span>
        </h2>
        <EnrollmentBars rows={enrollment ?? []} />
        <div className="border-t border-hairline px-4 py-3">
          <ReportEnrollmentForm
            studySiteId={site.study_site_id}
            latest={enrollment?.[0]}
          />
        </div>
      </section>

      <div id="documents" className="scroll-mt-28 space-y-6">
        {[...byZone.entries()].map(([zoneLabel, rows]) => (
          <section key={zoneLabel} className="card">
            <h2 className="border-b border-hairline px-4 py-3 text-sm font-medium text-ink2">
              {zoneLabel}
            </h2>
            <ul className="divide-y divide-hairline">
              {rows.map((r) => (
                <ExpectedRow
                  key={r.expected_document_id}
                  row={r}
                  canUpload={can(me, "upload")}
                  canWaive={can(me, "administer")}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

// --- Delegation of authority (ADR-0023) --------------------------------------

function DelegationLog({
  studySiteId,
  staff,
}: {
  studySiteId: string;
  staff: StaffMember[] | undefined;
}) {
  const { data: entries } = useDelegationLog(studySiteId);
  // Log entries are the site's record of itself (ADR-0023): only a seat
  // holding 'log' authors or ends them; everyone else reads (ADR-0028).
  const { data: me } = useMe();
  const canLog = can(me, "log");
  return (
    <>
      {entries?.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">No delegations recorded.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {entries?.map((d) => (
            <DelegationRow key={d.delegation_id} d={d} canLog={canLog} />
          ))}
        </ul>
      )}
      {canLog && (
        <div className="border-t border-hairline px-4 py-3">
          <NewDelegationForm studySiteId={studySiteId} staff={staff} />
        </div>
      )}
    </>
  );
}

function DelegationRow({ d, canLog }: { d: Delegation; canLog: boolean }) {
  const endDelegation = useEndDelegation();
  const [err, setErr] = useState<unknown>(null);
  const ended = d.status === "ended";
  // An entry ended today is still derived-active through its end date, but
  // the end fact is set — ending twice would only earn a 409.
  const endable = canLog && d.end_date === null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <div className="min-w-0">
        <span className={`text-sm font-medium ${ended ? "text-muted line-through" : ""}`}>
          {d.given_name} {d.family_name}
          {d.credentials ? `, ${d.credentials}` : ""}
        </span>
        <div className="text-xs text-ink2">{d.delegated_tasks.join(" · ")}</div>
        <div className="text-xs text-muted">
          from {d.start_date}
          {d.end_date ? ` to ${d.end_date}` : ""} · authorized by{" "}
          {d.authorizer_given_name} {d.authorizer_family_name}
          {!d.authorizer_was_pi && (
            <span style={{ color: "var(--status-serious)" }}>
              {" "}
              — not an active PI at this site on the start date
            </span>
          )}
        </div>
      </div>
      <span className="ml-auto flex items-center gap-2 text-xs">
        {!ended && d.credential_open_items > 0 && (
          <span style={{ color: "var(--status-serious)" }}>
            {d.credential_open_items} open credential item
            {d.credential_open_items > 1 ? "s" : ""}
          </span>
        )}
        {endable && (
          <button
            onClick={() => {
              if (
                !window.confirm(
                  `End ${d.given_name} ${d.family_name}'s delegation as of today? Entries are never deleted — this records an end date.`,
                )
              )
                return;
              setErr(null);
              endDelegation.mutate(
                { delegationId: d.delegation_id, endDate: localToday() },
                { onError: (e) => setErr(e) },
              );
            }}
            disabled={endDelegation.isPending}
            className="rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
            title="Records today as the delegation's end date — entries are never deleted"
          >
            {endDelegation.isPending ? "Ending…" : "End"}
          </button>
        )}
        <SpecChip spec={DELEGATION_STATUS[d.status]} />
      </span>
      <EntrySignatures kind="delegation" entryId={d.delegation_id} signatures={d.signatures} />
      <ErrorNote error={err} className="w-full" />
    </li>
  );
}

// --- Entry-level e-signatures (ADR-0036) --------------------------------------

/**
 * The §11.200 ceremony applied to one log entry: existing signatures render
 * with signer, meaning, and time (§11.50), each verified server-side against
 * the entry's current facts; the sign action mirrors the document ceremony,
 * re-authentication included.
 */
function EntrySignatures({
  kind,
  entryId,
  signatures,
}: {
  kind: LogEntryKind;
  entryId: string;
  signatures: LogSignature[];
}) {
  const { data: me } = useMe();
  const sign = useSignLogEntry();
  const [confirming, setConfirming] = useState(false);
  const [meaning, setMeaning] = useState<LogSignature["meaning"]>("author");
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="w-full space-y-1 pl-0 text-xs">
      {signatures.map((sg) => (
        <div key={sg.signature_id} className="flex flex-wrap items-center gap-x-2 text-muted">
          <PenLine size={11} aria-hidden style={{ color: "var(--info)" }} />
          <span className="text-ink2">
            {sg.signer_given_name} {sg.signer_family_name}
          </span>
          <span>meaning: {sg.meaning}</span>
          <span>{new Date(sg.signed_at).toLocaleString()}</span>
          <span
            className="mono"
            title={`Signature is bound to the SHA-256 of the entry's facts at signing: ${sg.signed_sha256}`}
          >
            {sg.signed_sha256.slice(0, 12)}…
          </span>
          {!sg.facts_match && (
            <span style={{ color: "var(--status-serious)" }}>
              entry changed since signing — signature covers the earlier facts
            </span>
          )}
        </div>
      ))}
      {can(me, "sign") &&
        (confirming ? (
          <div className="rounded-md border border-hairline bg-page px-3 py-2">
            <p className="text-ink2">
              Signing records your name, the date and time, and the meaning you
              choose, bound to this entry's current facts. You'll be asked to
              confirm your identity before the signature is applied.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <select
                value={meaning}
                onChange={(e) => setMeaning(e.target.value as LogSignature["meaning"])}
                className={inputCls}
                aria-label="Signature meaning"
              >
                <option value="author">author</option>
                <option value="review">review</option>
                <option value="approval">approval</option>
              </select>
              <button
                onClick={() => {
                  setConfirming(false);
                  setErr(null);
                  sign.mutate({ kind, entryId, meaning }, { onError: (e) => setErr(e) });
                }}
                disabled={sign.isPending}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ background: "var(--info)" }}
              >
                <PenLine size={12} aria-hidden />
                {sign.isPending ? "Signing…" : "Confirm & sign"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink2 hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={sign.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
            title="Apply a Part 11 e-signature to this entry"
          >
            <PenLine size={11} aria-hidden />
            {sign.isPending ? "Signing…" : "Sign entry"}
          </button>
        ))}
      <ErrorNote error={err} />
    </div>
  );
}

/**
 * Delegated tasks as removable chips: type a task, Enter or comma adds it.
 * Replaces the old "Tasks, comma-separated" free-text field.
 */
function TaskTagInput({
  tasks,
  onChange,
}: {
  tasks: string[];
  onChange: (tasks: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (t && !tasks.includes(t)) onChange([...tasks, t]);
    setDraft("");
  };
  return (
    <div className="flex min-h-[26px] w-72 flex-wrap items-center gap-1 rounded-md border border-hairline bg-surface px-2 py-1">
      {tasks.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-xs text-ink2"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tasks.filter((x) => x !== t))}
            aria-label={`Remove task ${t}`}
            className="text-muted hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && draft === "" && tasks.length > 0) {
            onChange(tasks.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={tasks.length === 0 ? "Type a task, press Enter" : ""}
        className="min-w-24 flex-1 bg-transparent text-xs outline-none"
        aria-label="Add a delegated task"
      />
    </div>
  );
}

function NewDelegationForm({
  studySiteId,
  staff,
}: {
  studySiteId: string;
  staff: StaffMember[] | undefined;
}) {
  const create = useCreateDelegation();
  const active = staff?.filter((m) => m.end_date === null) ?? [];
  const pis = active.filter((m) => m.role === "principal_investigator");
  const [personId, setPersonId] = useState("");
  const [tasks, setTasks] = useState<string[]>([]);
  const [start, setStart] = useState(localToday());
  const [authorizedBy, setAuthorizedBy] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const authorizer = authorizedBy || pis[0]?.person_id || "";
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!personId || !authorizer || tasks.length === 0) return;
        setErr(null);
        create.mutate(
          { studySiteId, personId, delegatedTasks: tasks, startDate: start, authorizedBy: authorizer },
          {
            onError: (e) => setErr(e),
            onSuccess: () => {
              setPersonId("");
              setTasks([]);
            },
          },
        );
      }}
    >
      <label className={fieldCls}>
        Delegate
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className={inputCls}
          required
        >
          <option value="">Choose a staff member…</option>
          {active.map((m) => (
            <option key={m.role_id} value={m.person_id}>
              {m.family_name}, {m.given_name} ({ROLE_LABEL[m.role] ?? m.role})
            </option>
          ))}
        </select>
      </label>
      <label className={fieldCls}>
        Delegated tasks
        <TaskTagInput tasks={tasks} onChange={setTasks} />
      </label>
      <label className={fieldCls}>
        Start date
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className={inputCls}
          required
        />
      </label>
      <label className={fieldCls}>
        Authorized by
        <select
          value={authorizer}
          onChange={(e) => setAuthorizedBy(e.target.value)}
          className={inputCls}
        >
          {active.map((m) => (
            <option key={m.role_id} value={m.person_id}>
              {m.family_name}, {m.given_name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={create.isPending || !personId || !authorizer || tasks.length === 0}
        className={buttonCls}
      >
        <UserCheck size={12} aria-hidden />
        {create.isPending ? "Recording…" : "Record delegation"}
      </button>
      <ErrorNote error={err} className="w-full" />
    </form>
  );
}

// --- Training log (ADR-0023) --------------------------------------------------

function TrainingLog({
  studySiteId,
  staff,
}: {
  studySiteId: string;
  staff: StaffMember[] | undefined;
}) {
  const { data: entries } = useTrainingLog(studySiteId);
  const { data: me } = useMe();
  return (
    <>
      {entries?.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">No training recorded.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {entries?.map((t) => (
            <TrainingRow key={t.training_record_id} t={t} />
          ))}
        </ul>
      )}
      {can(me, "log") && (
        <div className="border-t border-hairline px-4 py-3">
          <NewTrainingForm studySiteId={studySiteId} staff={staff} />
        </div>
      )}
    </>
  );
}

function TrainingRow({ t }: { t: TrainingRecord }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <div className="min-w-0">
        <span className="text-sm font-medium">
          {t.given_name} {t.family_name}
          {t.credentials ? `, ${t.credentials}` : ""}
        </span>
        <span className="ml-2 text-sm text-ink2">{t.topic}</span>
        <div className="text-xs text-muted">
          completed {t.trained_on}
          {t.expires_at ? ` · expires ${t.expires_at}` : ""}
          {t.document_id && (
            <>
              {" · "}
              <Link to={`/documents/${t.document_id}`} className="hover:underline">
                certificate on file
              </Link>
            </>
          )}
        </div>
      </div>
      <span className="ml-auto">
        <StatusChip status={t.status} />
      </span>
      <EntrySignatures
        kind="training_record"
        entryId={t.training_record_id}
        signatures={t.signatures}
      />
    </li>
  );
}

function NewTrainingForm({
  studySiteId,
  staff,
}: {
  studySiteId: string;
  staff: StaffMember[] | undefined;
}) {
  const record = useRecordTraining();
  const active = staff?.filter((m) => m.end_date === null) ?? [];
  const [personId, setPersonId] = useState("");
  const [topic, setTopic] = useState("");
  const [trained, setTrained] = useState(localToday());
  const [expires, setExpires] = useState("");
  const [err, setErr] = useState<unknown>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!personId || !topic.trim()) return;
        setErr(null);
        record.mutate(
          {
            studySiteId,
            personId,
            topic: topic.trim(),
            trainedOn: trained,
            ...(expires ? { expiresAt: expires } : {}),
          },
          {
            onError: (e) => setErr(e),
            onSuccess: () => {
              setPersonId("");
              setTopic("");
              setExpires("");
            },
          },
        );
      }}
    >
      <label className={fieldCls}>
        Person
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className={inputCls}
          required
        >
          <option value="">Choose a staff member…</option>
          {active.map((m) => (
            <option key={m.role_id} value={m.person_id}>
              {m.family_name}, {m.given_name}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldCls}>
        Topic
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Protocol amendment 3"
          className={`w-56 ${inputCls}`}
          required
        />
      </label>
      <label className={fieldCls}>
        Completed
        <input
          type="date"
          value={trained}
          onChange={(e) => setTrained(e.target.value)}
          className={inputCls}
          required
        />
      </label>
      <label className={fieldCls}>
        Expires (optional)
        <input
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          className={inputCls}
        />
      </label>
      <button
        type="submit"
        disabled={record.isPending || !personId || !topic.trim()}
        className={buttonCls}
      >
        <GraduationCap size={12} aria-hidden />
        {record.isPending ? "Recording…" : "Record training"}
      </button>
      <ErrorNote error={err} className="w-full" />
    </form>
  );
}

// --- Screening log (ADR-0036) --------------------------------------------------

function ScreeningLog({ studySiteId }: { studySiteId: string }) {
  const { data: entries } = useScreeningLog(studySiteId);
  const { data: summary } = useScreeningSummary(studySiteId);
  const { data: me } = useMe();
  const canLog = can(me, "log");
  // The oversight cross-check: the log's derived counts vs the site's own
  // latest as-reported aggregates (ADR-0011). Disagreement flags, not blocks.
  const mismatch =
    summary?.reported_screened != null &&
    (summary.log_screened !== summary.reported_screened ||
      summary.log_enrolled !== summary.reported_enrolled);
  return (
    <>
      {summary && (
        <div className="border-b border-hairline px-4 py-2.5 text-xs text-ink2">
          Log: {summary.log_screened} screened · {summary.log_enrolled} enrolled ·{" "}
          {summary.log_screen_failed} screen failed · {summary.log_in_screening} in
          screening
          {summary.reported_screened != null && (
            <>
              {" · "}last reported ({summary.reported_as_of}): {summary.reported_screened}{" "}
              screened / {summary.reported_enrolled} enrolled
            </>
          )}
          {mismatch && (
            <span style={{ color: "var(--status-serious)" }}>
              {" "}
              — log and report disagree; update the enrollment report below
            </span>
          )}
        </div>
      )}
      {entries?.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">No screenings recorded.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {entries?.map((e) => (
            <ScreeningRow key={e.screening_entry_id} e={e} canLog={canLog} />
          ))}
        </ul>
      )}
      {canLog && (
        <div className="border-t border-hairline px-4 py-3">
          <NewScreeningForm studySiteId={studySiteId} />
        </div>
      )}
    </>
  );
}

function ScreeningRow({ e, canLog }: { e: ScreeningEntry; canLog: boolean }) {
  const record = useRecordScreeningOutcome();
  const [failing, setFailing] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<unknown>(null);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <span className="mono text-sm font-medium">{e.screening_number}</span>
      <div className="min-w-0 text-xs text-muted">
        screened {e.screened_on}
        {e.enrolled_on ? ` · enrolled ${e.enrolled_on}` : ""}
        {e.screen_failed_on ? ` · failed ${e.screen_failed_on}: ${e.failure_reason}` : ""}
      </div>
      <span className="ml-auto flex items-center gap-2 text-xs">
        {canLog && e.status === "in_screening" && !failing && (
          <>
            <button
              onClick={() => {
                if (
                  !window.confirm(
                    `Record ${e.screening_number} as enrolled today? The outcome is recorded once — entries are never deleted or edited.`,
                  )
                )
                  return;
                setErr(null);
                record.mutate(
                  { screeningEntryId: e.screening_entry_id, enrolledOn: localToday() },
                  { onError: (er) => setErr(er) },
                );
              }}
              disabled={record.isPending}
              className="rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
              title="Records today as the enrollment date — the entry's single permitted change"
            >
              {record.isPending ? "Recording…" : "Enrolled"}
            </button>
            <button
              onClick={() => setFailing(true)}
              className="rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page"
            >
              Screen fail
            </button>
          </>
        )}
        <SpecChip spec={SCREENING_STATUS[e.status]} />
      </span>
      {failing && (
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!reason.trim()) return;
            setErr(null);
            record.mutate(
              {
                screeningEntryId: e.screening_entry_id,
                screenFailedOn: localToday(),
                failureReason: reason.trim(),
              },
              { onError: (er) => setErr(er), onSuccess: () => setFailing(false) },
            );
          }}
        >
          <input
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
            placeholder="Reason — criterion reference, not clinical detail"
            className="w-80 rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
            aria-label="Screen-failure reason"
            autoFocus
          />
          <button
            type="submit"
            disabled={record.isPending || !reason.trim()}
            className="rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50"
          >
            {record.isPending ? "Recording…" : "Record screen fail"}
          </button>
          <button
            type="button"
            onClick={() => setFailing(false)}
            className="text-xs text-muted hover:underline"
          >
            cancel
          </button>
        </form>
      )}
      <EntrySignatures
        kind="screening_entry"
        entryId={e.screening_entry_id}
        signatures={e.signatures}
      />
      <ErrorNote error={err} className="w-full" />
    </li>
  );
}

function NewScreeningForm({ studySiteId }: { studySiteId: string }) {
  const create = useCreateScreeningEntry();
  const [number, setNumber] = useState("");
  const [screened, setScreened] = useState(localToday());
  const [err, setErr] = useState<unknown>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!number.trim()) return;
        setErr(null);
        create.mutate(
          { studySiteId, screeningNumber: number.trim(), screenedOn: screened },
          {
            onError: (er) => setErr(er),
            onSuccess: () => setNumber(""),
          },
        );
      }}
    >
      <label className={fieldCls}>
        Screening number
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="e.g. S-017 — the site-assigned code, never a name"
          className={`w-72 ${inputCls}`}
          required
        />
      </label>
      <label className={fieldCls}>
        Screened on
        <input
          type="date"
          value={screened}
          onChange={(e) => setScreened(e.target.value)}
          className={inputCls}
          required
        />
      </label>
      <button
        type="submit"
        disabled={create.isPending || !number.trim()}
        className={buttonCls}
      >
        <ClipboardList size={12} aria-hidden />
        {create.isPending ? "Recording…" : "Record screening"}
      </button>
      <ErrorNote error={err} className="w-full" />
    </form>
  );
}

function ExpectedRow({
  row,
  canUpload,
  canWaive,
}: {
  row: ExpectedDocument;
  canUpload: boolean;
  canWaive: boolean;
}) {
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
        {canWaive && row.status === "missing" && (
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
        {canWaive && row.status === "waived" && (
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
        {canUpload &&
          (row.status === "missing" ||
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

function StaffRow({ m, readOnly }: { m: StaffMember; readOnly: boolean }) {
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
        {!ended && !readOnly && (
          <button
            onClick={() => {
              if (
                !window.confirm(
                  `End ${m.given_name} ${m.family_name}'s ${ROLE_LABEL[m.role] ?? m.role} role as of today? Assignments are never deleted — this records an end date.`,
                )
              )
                return;
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
      className="flex flex-wrap items-end gap-3"
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
      <label className={fieldCls}>
        Person
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className={inputCls}
          required
        >
          <option value="">Add staff…</option>
          {people?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.family_name}, {p.given_name}
              {p.credentials ? ` (${p.credentials})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldCls}>
        Site role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
          className={inputCls}
        >
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldCls}>
        Start date
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className={inputCls}
          required
        />
      </label>
      <button
        type="submit"
        disabled={assign.isPending || sync.isPending || !personId}
        className={buttonCls}
      >
        <UserPlus size={12} aria-hidden />
        {assign.isPending || sync.isPending ? "Adding…" : "Assign role"}
      </button>
      <span className="pb-1 text-xs text-muted">
        New person? Create them on the <Link to="/admin" className="hover:underline">admin page</Link> first.
      </span>
      <ErrorNote error={err} className="w-full" />
    </form>
  );
}
