import { FileCheck2, Moon, Search, ShieldCheck, ShieldX, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { useChainStatus, useStudies } from "./api";
import AdminPage from "./pages/AdminPage";
import AuditPage from "./pages/AuditPage";
import PortfolioPage from "./pages/PortfolioPage";
import QueuePage from "./pages/QueuePage";
import SearchPage from "./pages/SearchPage";
import DocumentPage from "./pages/DocumentPage";
import SitePage from "./pages/SitePage";
import StudyPage from "./pages/StudyPage";
import VisitPage from "./pages/VisitPage";

function useTheme() {
  const [dark, setDark] = useState(
    () =>
      localStorage.getItem("ctms_theme") === "dark" ||
      (localStorage.getItem("ctms_theme") === null &&
        window.matchMedia("(prefers-color-scheme: dark)").matches),
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("ctms_theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function HeaderSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      className="hidden items-center md:flex"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length < 2) return;
        navigate(`/search?q=${encodeURIComponent(q.trim())}`);
        setQ("");
      }}
      role="search"
    >
      <Search size={14} className="-mr-6 z-10 ml-2 text-muted" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search documents…"
        className="w-44 rounded-md border border-hairline bg-surface py-1 pl-7 pr-2 text-sm"
        aria-label="Search documents"
      />
    </form>
  );
}

function ChainBadge() {
  const { data } = useChainStatus();
  if (!data) return null;
  const Icon = data.valid ? ShieldCheck : ShieldX;
  return (
    <Link
      to="/audit"
      className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-surface sm:inline-flex"
      style={{
        color: data.valid ? "var(--status-good)" : "var(--status-critical)",
        borderColor: "var(--ring)",
      }}
      title="Live verification of the append-only audit-trail hash chain — click to browse the audit trail"
    >
      <Icon size={13} aria-hidden />
      <span className="text-ink2">
        audit chain {data.valid ? "verified" : "BROKEN"} ·{" "}
        <span className="mono">{data.events}</span> events
      </span>
    </Link>
  );
}

export default function App() {
  const { dark, toggle } = useTheme();
  const { data: studies } = useStudies();
  // Multi-study (ADR-0021): the selected study persists across visits;
  // re-seeds regenerate ids, so an unknown stored id falls back to the first
  // study (list is ordered by protocol number).
  const [studyId, setStudyId] = useState<string | null>(
    () => localStorage.getItem("ctms_study"),
  );
  const selectStudy = (id: string) => {
    setStudyId(id);
    localStorage.setItem("ctms_study", id);
  };
  const study = studies?.find((s) => s.id === studyId) ?? studies?.[0];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-hairline bg-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <FileCheck2 size={20} style={{ color: "var(--info)" }} aria-hidden />
            <span>ctms-core</span>
          </Link>
          {studies && studies.length > 1 ? (
            <select
              value={study?.id ?? ""}
              onChange={(e) => selectStudy(e.target.value)}
              className="hidden rounded-md border border-hairline bg-surface px-2 py-1 text-sm text-ink2 sm:inline"
              aria-label="Switch study"
            >
              {studies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.protocol_number}
                </option>
              ))}
            </select>
          ) : (
            study && (
              <span className="hidden text-sm text-ink2 sm:inline">
                {study.protocol_number} · {study.sponsor_name}
              </span>
            )
          )}
          <div className="ml-auto flex items-center gap-2">
            <HeaderSearch />
            <ChainBadge />
            <Link
              to="/portfolio"
              className="rounded-md px-2 py-1 text-sm text-ink2 hover:bg-surface"
            >
              Portfolio
            </Link>
            <Link
              to="/queue"
              className="rounded-md px-2 py-1 text-sm text-ink2 hover:bg-surface"
            >
              Review queue
            </Link>
            <Link
              to="/admin"
              className="rounded-md px-2 py-1 text-sm text-ink2 hover:bg-surface"
            >
              Admin
            </Link>
            <Link
              to="/audit"
              className="rounded-md px-2 py-1 text-sm text-ink2 hover:bg-surface"
            >
              Audit trail
            </Link>
            <a
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-2 py-1 text-sm text-ink2 hover:bg-surface"
            >
              API docs
            </a>
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="rounded-md p-2 text-ink2 hover:bg-surface"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<StudyPage study={study} />} />
          <Route path="/sites/:studySiteId" element={<SitePage study={study} />} />
          <Route path="/visits/:visitId" element={<VisitPage />} />
          <Route path="/documents/:documentId" element={<DocumentPage />} />
          <Route path="/search" element={<SearchPage study={study} />} />
          <Route path="/portfolio" element={<PortfolioPage onSelectStudy={selectStudy} />} />
          <Route path="/queue" element={<QueuePage study={study} />} />
          <Route path="/admin" element={<AdminPage study={study} />} />
          <Route path="/audit" element={<AuditPage />} />
        </Routes>
      </main>
    </div>
  );
}
