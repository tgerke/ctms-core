import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { usePortfolio, type PortfolioEntry } from "../api";
import { PageState } from "../ops";

// Portfolio rollup (ADR-0021): every study's oversight numbers on one page,
// computed by GET /portfolio from the same views the per-study pages read.

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
    </div>
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
