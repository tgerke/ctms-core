import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDocumentSearch, type ExpectedStatus, type Study } from "../api";
import { ErrorNote, PageState } from "../ops";
import { StatusChip } from "../status";

// Document search (ADR-0019 + ADR-0022): every word must match the
// document's metadata — title, artifact taxonomy, site, person, uploader,
// file names, filing source, status — or the extracted text inside its
// versions. Content matches show a snippet of the surrounding text.

const DOC_STATUSES = ["pending_review", "effective", "returned", "superseded"] as const;

// document.status shares chips with the expected-document statuses where the
// names overlap; 'effective' renders as the 'current' chip.
const chipFor = (status: string): ExpectedStatus =>
  status === "effective" ? "current" : (status as ExpectedStatus);

export default function SearchPage({ study }: { study: Study | undefined }) {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? undefined;
  const [input, setInput] = useState(q);
  useEffect(() => setInput(q), [q]);
  const search = useDocumentSearch(study?.id, q, status);

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

  if (!study)
    return <PageState query={{ isPending: true, isError: false, error: null }} label="study" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Document search</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink2">
          Searches every document's title, TMF artifact, site, person,
          uploader, file names, and the text inside each version in{" "}
          {study.protocol_number}. Every word must match — try "raman license"
          or a phrase from inside a document.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", input.trim() || undefined);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search documents…"
          className="w-80 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm"
          aria-label="Search documents"
          autoFocus
        />
        <button
          type="submit"
          disabled={input.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-sm text-ink2 hover:bg-page disabled:opacity-50"
        >
          <Search size={14} aria-hidden />
          Search
        </button>
        <div className="flex flex-wrap gap-2">
          {DOC_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setParam("status", s)}
              className={status && status !== s ? "opacity-40" : ""}
              aria-pressed={status === s}
            >
              <StatusChip status={chipFor(s)} />
            </button>
          ))}
        </div>
      </form>

      {q.trim().length >= 2 && (
        <section className="card">
          <h2 className="border-b border-hairline px-4 py-3 font-medium">
            {search.isPending
              ? "Searching…"
              : `${search.data?.length ?? 0} match${(search.data?.length ?? 0) === 1 ? "" : "es"} for "${q}"`}
            {status ? ` · ${status.replace(/_/g, " ")}` : ""}
          </h2>
          <ErrorNote error={search.error} className="px-4 py-2" />
          {search.data?.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">
              Nothing matches every word. Fewer or shorter words widen the net.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {search.data?.map((r) => (
                <li
                  key={r.document_id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                >
                  <span className="mono text-xs text-muted">{r.artifact_code}</span>
                  <div className="min-w-0">
                    <Link
                      to={`/documents/${r.document_id}`}
                      className="text-sm hover:underline"
                    >
                      {r.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {r.artifact_name}
                      {r.site_number ? ` · Site ${r.site_number}` : " · study-level"}
                      {r.person_family_name
                        ? ` · ${r.person_given_name} ${r.person_family_name}`
                        : ""}
                      {` · v${r.version_count}`}
                      {r.effective_date ? ` · effective ${r.effective_date}` : ""}
                      {r.expires_at ? ` · expires ${r.expires_at}` : ""}
                    </div>
                    {r.content_snippet && (
                      <div className="mt-0.5 text-xs italic text-ink2">
                        “{r.content_snippet}”
                      </div>
                    )}
                  </div>
                  <span className="ml-auto">
                    <StatusChip status={chipFor(r.status)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
