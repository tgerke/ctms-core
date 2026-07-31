import { CheckCircle2, Circle, Flag, RefreshCw, Rocket } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  can,
  useCreateMilestone,
  useEnrollment,
  useExpected,
  useIssues,
  useMe,
  useMilestones,
  useSites,
  useStudies,
  useStudyStartup,
  useSyncExpected,
  useUpdateStudy,
  useVisits,
  type ExpectedDocument,
  type IssueStatus,
  type StartupSite,
  type Study,
  type VisitStage,
} from "../api";
import {
  AddMilestoneForm,
  EnrollmentBars,
  ErrorNote,
  IssueListItem,
  MilestoneStrip,
  NewIssueForm,
  PageState,
  VisitListItem,
} from "../ops";
import {
  ISSUE_STATUS,
  SpecChip,
  STATUS,
  StatusCell,
  StatusChip,
  VISIT_STAGE,
  worst,
} from "../status";

function StatTile({
  label,
  value,
  cssVar,
}: {
  label: string;
  value: string | number;
  cssVar?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="text-3xl font-semibold" style={cssVar ? { color: `var(${cssVar})` } : {}}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-ink2">{label}</div>
    </div>
  );
}

export default function StudyPage({ study }: { study: Study | undefined }) {
  // Same cached query App uses to pick the study; here only for load/error state.
  const studiesQuery = useStudies();
  const { data: sites } = useSites(study?.id);
  const { data: expected } = useExpected(study?.id);
  const navigate = useNavigate();
  // Filters live in the URL so any view is a pasteable link.
  const [params, setParams] = useSearchParams();
  const visitStage = (params.get("visit_stage") as VisitStage | null) ?? undefined;
  const issueStatus = (params.get("issue_status") as IssueStatus | null) ?? undefined;
  const { data: milestones } = useMilestones(study?.id);
  const { data: enrollment } = useEnrollment(study?.id);
  const { data: visits } = useVisits(study?.id, { stage: visitStage });
  const { data: issues } = useIssues(study?.id, { status: issueStatus });

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

  const { grid, zones, studyLevel, stats } = useMemo(() => {
    const rows = expected ?? [];
    const studyLevel = rows.filter((r) => r.scope_level === "study");
    const siteRows = rows.filter((r) => r.study_site_id !== null);

    // rule -> site -> matching expected rows (person rules aggregate per site)
    const ruleIndex = new Map<
      string,
      { rule: ExpectedDocument; bySite: Map<string, ExpectedDocument[]> }
    >();
    for (const r of siteRows) {
      let entry = ruleIndex.get(r.rule_id);
      if (!entry) {
        entry = { rule: r, bySite: new Map() };
        ruleIndex.set(r.rule_id, entry);
      }
      const list = entry.bySite.get(r.study_site_id!) ?? [];
      list.push(r);
      entry.bySite.set(r.study_site_id!, list);
    }
    const ruleList = [...ruleIndex.values()].sort((a, b) =>
      a.rule.artifact_code.localeCompare(b.rule.artifact_code),
    );
    const zones = new Map<string, typeof ruleList>();
    for (const entry of ruleList) {
      const key = `${String(entry.rule.zone_number).padStart(2, "0")} ${entry.rule.zone_name}`;
      zones.set(key, [...(zones.get(key) ?? []), entry]);
    }

    const count = (s: string) => rows.filter((r) => r.status === s).length;
    const stats = {
      total: rows.length,
      pct: rows.length
        ? Math.round((100 * count("current")) / rows.length)
        : 0,
      missing: count("missing"),
      attention: count("expired") + count("expiring_soon"),
      pending: count("pending_review"),
    };
    return { grid: ruleIndex, zones, studyLevel, stats };
  }, [expected]);

  if (!study) return <PageState query={studiesQuery} label="study" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{study.protocol_number}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink2">{study.title}</p>
      </div>

      {study.status === "planning" && <StartupPanel study={study} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="expected documents" value={stats.total} />
        <StatTile label="current" value={`${stats.pct}%`} cssVar="--status-good" />
        <StatTile label="missing" value={stats.missing} cssVar="--muted" />
        <StatTile
          label="expired or expiring"
          value={stats.attention}
          cssVar={stats.attention ? "--status-critical" : "--status-good"}
        />
        <StatTile
          label="pending review"
          value={stats.pending}
          cssVar={stats.pending ? "--info" : undefined}
        />
      </div>

      {/* Operational layer: milestones, enrollment, visits, issues */}
      <section className="card">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">
          Milestones{" "}
          <span className="text-xs font-normal text-muted">planned vs actual — derived</span>
        </h2>
        <div className="px-4 py-3">
          <MilestoneStrip milestones={milestones ?? []} achievable />
        </div>
        <div className="border-t border-hairline px-4 py-3">
          <AddMilestoneForm studyId={study.id} sites={sites ?? []} />
        </div>
      </section>

      <section className="card">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">
          Enrollment vs target{" "}
          <span className="text-xs font-normal text-muted">
            as reported by sites — subject-level data stays in the EDC
          </span>
        </h2>
        <EnrollmentBars rows={enrollment ?? []} />
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
          <h2 className="font-medium">Monitoring visits</h2>
          <div className="ml-auto flex flex-wrap gap-2">
            {(Object.keys(VISIT_STAGE) as VisitStage[]).map((s) => (
              <button
                key={s}
                onClick={() => setParam("visit_stage", s)}
                className={visitStage && visitStage !== s ? "opacity-40" : ""}
                aria-pressed={visitStage === s}
              >
                <SpecChip spec={VISIT_STAGE[s]} />
              </button>
            ))}
          </div>
        </div>
        {visits?.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No visits match.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {visits?.map((v) => (
              <VisitListItem key={v.monitoring_visit_id} v={v} showSite />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
          <h2 className="font-medium">Issues & deviations</h2>
          <div className="ml-auto flex flex-wrap gap-2">
            {(Object.keys(ISSUE_STATUS) as IssueStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setParam("issue_status", s)}
                className={issueStatus && issueStatus !== s ? "opacity-40" : ""}
                aria-pressed={issueStatus === s}
              >
                <SpecChip spec={ISSUE_STATUS[s]} />
              </button>
            ))}
          </div>
        </div>
        {issues?.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No issues match.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {issues?.map((i) => (
              <IssueListItem key={i.id} issue={i} showSite />
            ))}
          </ul>
        )}
        <div className="border-t border-hairline px-4 py-3">
          <NewIssueForm studyId={study.id} />
        </div>
      </section>

      {/* Completeness grid: requirements × sites */}
      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
          <h2 className="font-medium">Site document matrix</h2>
          <div className="ml-auto flex flex-wrap gap-2">
            {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => (
              <StatusChip key={s} status={s} />
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Requirement</th>
              {sites?.map((s) => (
                <th key={s.study_site_id} className="px-2 py-2 text-center font-medium">
                  <Link
                    to={`/sites/${s.study_site_id}`}
                    className="hover:underline"
                    title={`${s.site_name} — ${s.pct_current}% current`}
                  >
                    <div>{s.site_number}</div>
                    <div className="font-normal">{s.site_name.split(" ")[0]}</div>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...zones.entries()].map(([zoneLabel, entries]) => (
              <ZoneRows
                key={zoneLabel}
                zoneLabel={zoneLabel}
                entries={entries}
                sites={sites ?? []}
                onCell={(siteId) => navigate(`/sites/${siteId}`)}
                colCount={(sites?.length ?? 0) + 1}
              />
            ))}
          </tbody>
        </table>
      </section>

      {/* Study-level documents */}
      <section className="card">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">
          Study-level documents
        </h2>
        <ul className="divide-y divide-hairline">
          {studyLevel.map((r) => (
            <li key={r.expected_document_id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="mono text-xs text-muted">{r.artifact_code}</span>
              {r.document_id ? (
                <Link to={`/documents/${r.document_id}`} className="text-sm hover:underline">
                  {r.document_title ?? r.artifact_name}
                </Link>
              ) : (
                <span className="text-sm text-ink2">{r.artifact_name}</span>
              )}
              <span className="ml-auto text-xs text-muted">
                {r.effective_expiry ? `expires ${r.effective_expiry}` : ""}
              </span>
              <StatusChip status={r.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ZoneRows({
  zoneLabel,
  entries,
  sites,
  onCell,
  colCount,
}: {
  zoneLabel: string;
  entries: { rule: ExpectedDocument; bySite: Map<string, ExpectedDocument[]> }[];
  sites: { study_site_id: string; site_number: string; site_name: string }[];
  onCell: (siteId: string) => void;
  colCount: number;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={colCount}
          className="border-t border-hairline bg-page px-4 py-1.5 text-xs font-medium text-muted"
        >
          {zoneLabel}
        </td>
      </tr>
      {entries.map(({ rule, bySite }) => (
        <tr key={rule.rule_id} className="border-t border-hairline/60">
          <td className="px-4 py-1.5">
            <div>{rule.artifact_name}</div>
            <div className="text-xs text-muted">{rule.rule_name}</div>
          </td>
          {sites.map((s) => {
            const cell = bySite.get(s.study_site_id);
            if (!cell || cell.length === 0) {
              return <td key={s.study_site_id} className="px-2 py-1.5 text-center" />;
            }
            const agg = worst(cell.map((c) => c.status));
            const open = cell.filter((c) => c.status !== "current").length;
            const detail =
              cell.length === 1
                ? STATUS[agg].label
                : `${cell.length} people — ${open} open: ` +
                  cell
                    .filter((c) => c.status !== "current")
                    .map((c) => `${c.person_family_name} ${STATUS[c.status].label.toLowerCase()}`)
                    .join(", ");
            return (
              <td key={s.study_site_id} className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onCell(s.study_site_id)}
                  className="cursor-pointer"
                  aria-label={`${rule.artifact_name} at site ${s.site_number}: ${detail}`}
                >
                  <StatusCell
                    status={agg}
                    count={cell.length > 1 ? open : undefined}
                    title={`${rule.artifact_name} · ${s.site_name}: ${detail}`}
                  />
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

// --- Guided startup (ADR-0034) -----------------------------------------------
// Every row is a derived fact with a deep link to where the fact changes —
// there is no checkbox state to keep. The panel disappears when the study
// leaves planning.

const startupButtonCls =
  "inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50";

function StartupItem({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5">
      {done ? (
        <CheckCircle2
          size={16}
          aria-label="Done"
          style={{ color: "var(--status-good)" }}
        />
      ) : (
        <Circle size={16} aria-label="To do" className="text-muted" />
      )}
      {children}
    </li>
  );
}

function SiteLinks({ sites }: { sites: StartupSite[] }) {
  return (
    <span className="flex flex-wrap gap-x-2 text-xs">
      {sites.map((s) => (
        <Link
          key={s.study_site_id}
          to={`/sites/${s.study_site_id}`}
          className="hover:underline"
        >
          Site {s.site_number} — {s.site_name}
        </Link>
      ))}
    </span>
  );
}

function StartupPanel({ study }: { study: Study }) {
  const { data: s } = useStudyStartup(study.id);
  const { data: me } = useMe();
  const sync = useSyncExpected(study.id);
  const update = useUpdateStudy();
  const [err, setErr] = useState<unknown>(null);
  if (!s) return null;
  const admin = can(me, "administer");
  const openItems =
    s.pending_site_count +
    s.sites_without_pi_count +
    s.unsynced_expected_count +
    s.missing_count;

  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <h2 className="font-medium">Study startup</h2>
        <span className="text-xs font-normal text-muted">
          derived from the record — each item completes when the underlying
          fact changes
        </span>
        {admin && (
          <button
            onClick={() => {
              const proceed =
                openItems === 0 ||
                window.confirm(
                  `${openItems} startup item${openItems === 1 ? "" : "s"} still open. Mark ${study.protocol_number} active anyway?`,
                );
              if (!proceed) return;
              setErr(null);
              update.mutate(
                { studyId: study.id, status: "active" },
                { onError: (e) => setErr(e) },
              );
            }}
            disabled={update.isPending}
            className={`ml-auto ${startupButtonCls}`}
            title="Moves the study from planning to active — status only moves forward"
          >
            <Rocket size={12} aria-hidden />
            {update.isPending ? "Activating…" : "Mark study active"}
          </button>
        )}
      </div>
      <ul className="divide-y divide-hairline text-sm">
        <StartupItem done={s.site_count > 0}>
          {s.site_count > 0 ? (
            <span>
              {s.site_count} site{s.site_count === 1 ? "" : "s"} on the study
              {s.pending_site_count > 0
                ? `, ${s.pending_site_count} awaiting activation`
                : ""}
            </span>
          ) : (
            <span>No sites on the study yet</span>
          )}
          {admin && (
            <Link to="/admin" className="ml-auto text-xs text-ink2 hover:underline">
              {s.site_count > 0 && s.pending_site_count > 0
                ? "Activate sites"
                : "Add sites"}
            </Link>
          )}
        </StartupItem>
        <StartupItem done={s.site_count > 0 && s.sites_without_pi_count === 0}>
          {s.sites_without_pi_count > 0 ? (
            <>
              <span>No principal investigator at:</span>
              <SiteLinks sites={s.sites_without_pi} />
            </>
          ) : (
            <span>
              {s.site_count > 0
                ? "Every site has an active principal investigator"
                : "Assign a principal investigator at each site"}
            </span>
          )}
        </StartupItem>
        <StartupItem done={s.rule_count > 0}>
          {s.rule_count > 0 ? (
            <span>
              {s.rule_count} requirement rule{s.rule_count === 1 ? "" : "s"} (
              {s.study_rule_count} study, {s.site_rule_count} per-site,{" "}
              {s.person_rule_count} per-person)
            </span>
          ) : (
            <span>No requirement rules — the study expects nothing on file</span>
          )}
          {admin && (
            <Link to="/admin" className="ml-auto text-xs text-ink2 hover:underline">
              Manage rules
            </Link>
          )}
        </StartupItem>
        <StartupItem done={s.rule_count > 0 && s.unsynced_expected_count === 0}>
          {s.unsynced_expected_count > 0 ? (
            <span>
              {s.unsynced_expected_count} expected document
              {s.unsynced_expected_count === 1 ? "" : "s"} not yet materialized
              from the rules
            </span>
          ) : (
            <span>
              {s.rule_count > 0
                ? `Expected documents are in sync (${s.expected_total} placeholder${s.expected_total === 1 ? "" : "s"})`
                : "Expected documents materialize once rules exist"}
            </span>
          )}
          {admin && s.unsynced_expected_count > 0 && (
            <button
              onClick={() => {
                setErr(null);
                sync.mutate(undefined, { onError: (e) => setErr(e) });
              }}
              disabled={sync.isPending}
              className={`ml-auto ${startupButtonCls}`}
            >
              <RefreshCw size={12} aria-hidden />
              {sync.isPending ? "Syncing…" : "Sync expected documents"}
            </button>
          )}
        </StartupItem>
        <StartupItem done={s.expected_total > 0 && s.missing_count === 0}>
          <span>
            {s.missing_count > 0
              ? `${s.missing_count} of ${s.expected_total} expected documents still missing — the matrix below shows where`
              : s.expected_total > 0
                ? "Nothing missing from the expected documents"
                : "Filing starts once expected documents exist"}
          </span>
        </StartupItem>
        <StartupItem done={s.milestone_count > 0}>
          {s.milestone_count > 0 ? (
            <span>
              {s.milestone_count} milestone{s.milestone_count === 1 ? "" : "s"}{" "}
              planned
            </span>
          ) : (
            <MilestonePlanner studyId={study.id} />
          )}
        </StartupItem>
        <StartupItem done={s.granted_people_count > 0}>
          <span>
            {s.granted_people_count > 0
              ? `${s.granted_people_count} ${s.granted_people_count === 1 ? "person has" : "people have"} access scoped to this study`
              : "No one has access scoped to this study yet (unscoped seats still reach it)"}
          </span>
          {admin && (
            <Link to="/admin" className="ml-auto text-xs text-ink2 hover:underline">
              Grant access
            </Link>
          )}
        </StartupItem>
      </ul>
      <ErrorNote error={err} className="px-4 pb-3" />
    </section>
  );
}

// Milestone names prefill from another study; dates are always entered fresh —
// a prior study's dates would be invented data for this one (ADR-0034).
function MilestonePlanner({ studyId }: { studyId: string }) {
  const { data: studies } = useStudies();
  const [sourceId, setSourceId] = useState("");
  const { data: sourceMilestones } = useMilestones(sourceId || undefined);
  const create = useCreateMilestone(studyId);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<unknown>(null);

  const names = useMemo(
    () => [
      ...new Set(
        (sourceMilestones ?? [])
          .filter((m) => !m.study_site_id)
          .map((m) => m.name),
      ),
    ],
    [sourceMilestones],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span>No milestones planned yet.</span>
        <label className="flex items-center gap-2 text-xs text-ink2">
          Reuse the names from
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
          >
            <option value="">another study…</option>
            {studies
              ?.filter((st) => st.id !== studyId)
              .map((st) => (
                <option key={st.id} value={st.id}>
                  {st.protocol_number}
                </option>
              ))}
          </select>
        </label>
        <span className="text-xs text-muted">
          or add them one by one in the Milestones section below
        </span>
      </div>
      {names.length > 0 && (
        <ul className="space-y-1">
          {names.map((name) => (
            <li key={name} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-56">{name}</span>
              <input
                type="date"
                value={dates[name] ?? ""}
                onChange={(e) => setDates((d) => ({ ...d, [name]: e.target.value }))}
                className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
                aria-label={`Planned date for ${name}`}
                disabled={added.has(name)}
              />
              <button
                onClick={() => {
                  if (!dates[name]) return;
                  setErr(null);
                  create.mutate(
                    { name, plannedDate: dates[name]! },
                    {
                      onError: (e) => setErr(e),
                      onSuccess: () => setAdded((a) => new Set(a).add(name)),
                    },
                  );
                }}
                disabled={create.isPending || !dates[name] || added.has(name)}
                className={startupButtonCls}
              >
                <Flag size={12} aria-hidden />
                {added.has(name) ? "Planned" : "Plan"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={err} />
    </div>
  );
}
