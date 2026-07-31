import { ArrowRight, FolderPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  canCreateStudy,
  useCreateStudy,
  useMe,
  useOrganizations,
  usePortfolio,
  useStudies,
  type PortfolioEntry,
} from "../api";
import { ErrorNote, PageState } from "../ops";

// Portfolio rollup (ADR-0021): every study's oversight numbers on one page,
// computed by GET /portfolio from the same views the per-study pages read.
// Study creation (ADR-0034) lives here too: the portfolio is where a new
// protocol enters the picture.

const inputCls = "rounded-md border border-hairline bg-surface px-2 py-1 text-xs";
const buttonCls =
  "inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50";

function Stat({
  label,
  value,
  cssVar,
}: {
  label: string;
  value: string | number;
  cssVar?: string;
}) {
  return (
    <div>
      <div
        className="text-xl font-semibold"
        style={cssVar ? { color: `var(${cssVar})` } : {}}
      >
        {value}
      </div>
      <div className="text-xs text-ink2">{label}</div>
    </div>
  );
}

export default function PortfolioPage({
  onSelectStudy,
}: {
  onSelectStudy: (studyId: string) => void;
}) {
  const portfolioQuery = usePortfolio();
  const { data: me } = useMe();
  if (!portfolioQuery.data) return <PageState query={portfolioQuery} label="portfolio" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink2">
          Every study, same derived truth: completeness, attention items, and
          enrollment roll up from the identical views the study pages read.
        </p>
      </div>
      {portfolioQuery.data.map((s) => (
        <StudyCard key={s.id} s={s} onSelect={() => onSelectStudy(s.id)} />
      ))}
      {canCreateStudy(me) && <NewStudyCard onSelectStudy={onSelectStudy} />}
    </div>
  );
}

// Creating a study takes an unscoped admin grant (ADR-0034); the API is the
// authority — this card is hidden for every other seat.
function NewStudyCard({ onSelectStudy }: { onSelectStudy: (studyId: string) => void }) {
  const navigate = useNavigate();
  const create = useCreateStudy();
  const { data: orgs } = useOrganizations();
  const { data: studies } = useStudies();
  const [protocolNumber, setProtocolNumber] = useState("");
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState("");
  const [sponsorOrgId, setSponsorOrgId] = useState("");
  const [templateStudyId, setTemplateStudyId] = useState("");
  const [err, setErr] = useState<unknown>(null);

  const sponsors = orgs?.filter((o) => o.kind !== "site_org") ?? [];

  return (
    <section className="card">
      <h2 className="border-b border-hairline px-4 py-3 font-medium">New study</h2>
      <form
        className="space-y-3 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!protocolNumber || !title || !sponsorOrgId) return;
          setErr(null);
          create.mutate(
            {
              protocolNumber,
              title,
              phase: phase || undefined,
              sponsorOrgId,
              templateStudyId: templateStudyId || undefined,
            },
            {
              onError: (e) => setErr(e),
              onSuccess: ({ id }) => {
                // Land on the new study's dashboard, where the startup
                // checklist takes over.
                onSelectStudy(id);
                navigate("/");
              },
            },
          );
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink2">
            Protocol number
            <input
              value={protocolNumber}
              onChange={(e) => setProtocolNumber(e.target.value)}
              placeholder="e.g. CORC-2301"
              className={`${inputCls} w-36`}
              required
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-ink2">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Full protocol title"
              className={`${inputCls} min-w-64 w-full`}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink2">
            Phase
            <input
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              placeholder="e.g. II"
              className={`${inputCls} w-20`}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink2">
            Sponsor
            <select
              value={sponsorOrgId}
              onChange={(e) => setSponsorOrgId(e.target.value)}
              className={inputCls}
              required
            >
              <option value="">Choose an organization…</option>
              {sponsors.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink2">
            Copy requirement rules from
            <select
              value={templateStudyId}
              onChange={(e) => setTemplateStudyId(e.target.value)}
              className={inputCls}
              title="Clones the study's requirement rules verbatim — what it expects on file, not its documents"
            >
              <option value="">Start empty</option>
              {studies?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.protocol_number}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={create.isPending || !protocolNumber || !title || !sponsorOrgId}
            className={buttonCls}
          >
            <FolderPlus size={12} aria-hidden />
            {create.isPending ? "Creating…" : "Create study"}
          </button>
        </div>
        <p className="text-xs text-muted">
          The study starts in planning. A startup checklist on its dashboard
          walks through sites, staff, requirements, and milestones before you
          mark it active.
        </p>
        <ErrorNote error={err} />
      </form>
    </section>
  );
}

function StudyCard({ s, onSelect }: { s: PortfolioEntry; onSelect: () => void }) {
  const attention = s.attention_count + s.open_issues + s.overdue_visits;
  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <h2 className="font-medium">{s.protocol_number}</h2>
        <span className="text-xs text-ink2">
          Phase {s.phase ?? "—"} · {s.status} · {s.active_site_count}/{s.site_count} sites
          active
        </span>
        <Link
          to="/"
          onClick={onSelect}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page"
        >
          Open dashboard
          <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
      <p className="px-4 pt-2 text-xs text-muted">{s.title}</p>
      <div className="grid grid-cols-3 gap-4 px-4 py-3 sm:grid-cols-7">
        <Stat label="expected docs" value={s.expected_total} />
        <Stat label="current" value={`${s.pct_current}%`} cssVar="--status-good" />
        <Stat label="missing" value={s.missing_count} cssVar="--muted" />
        <Stat
          label="expired / expiring"
          value={s.attention_count}
          cssVar={s.attention_count ? "--status-critical" : undefined}
        />
        <Stat
          label="review queue"
          value={s.review_queue}
          cssVar={s.review_queue ? "--info" : undefined}
        />
        <Stat
          label="open issues"
          value={s.open_issues}
          cssVar={s.open_issues ? "--status-warn" : undefined}
        />
        <Stat
          label="enrolled"
          value={`${s.enrolled}/${s.target_enrollment || "?"}`}
        />
      </div>
      {attention > 0 && (
        <div className="border-t border-hairline px-4 py-2 text-xs text-ink2">
          {attention} item{attention === 1 ? "" : "s"} need attention
          {s.overdue_visits > 0 ? ` · ${s.overdue_visits} overdue visit${s.overdue_visits === 1 ? "" : "s"}` : ""}
          {s.waived_count > 0 ? ` · ${s.waived_count} waived` : ""}
        </div>
      )}
    </section>
  );
}
