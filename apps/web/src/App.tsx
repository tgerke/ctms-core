import { FileCheck2, Moon, ShieldCheck, ShieldX, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { useChainStatus, useStudies } from "./api";
import AdminPage from "./pages/AdminPage";
import AuditPage from "./pages/AuditPage";
import QueuePage from "./pages/QueuePage";
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
  const study = studies?.[0];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-hairline bg-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <FileCheck2 size={20} style={{ color: "var(--info)" }} aria-hidden />
            <span>ctms-core</span>
          </Link>
          {study && (
            <span className="hidden text-sm text-ink2 sm:inline">
              {study.protocol_number} · {study.sponsor_name}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <ChainBadge />
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
          <Route path="/queue" element={<QueuePage study={study} />} />
          <Route path="/admin" element={<AdminPage study={study} />} />
          <Route path="/audit" element={<AuditPage />} />
        </Routes>
      </main>
    </div>
  );
}
