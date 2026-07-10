import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useExpected,
  useSites,
  type ExpectedDocument,
  type Study,
} from "../api";
import { STATUS, StatusCell, StatusChip, worst } from "../status";

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
  const { data: sites } = useSites(study?.id);
  const { data: expected } = useExpected(study?.id);
  const navigate = useNavigate();

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

  if (!study) return <div className="text-ink2">Loading study…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{study.protocol_number}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink2">{study.title}</p>
      </div>

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
