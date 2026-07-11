import { ArrowLeft, Download, Link2, PenLine, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fileUrl, useDocument, useDocumentAudit, useSign, useUpload } from "../api";
import { AuditEventList } from "../audit";
import { ErrorNote, PageState } from "../ops";

const fmtTime = (t: string) => new Date(t).toLocaleString();

export default function DocumentPage() {
  const { documentId } = useParams();
  const documentQuery = useDocument(documentId);
  const detail = documentQuery.data;
  const { data: audit } = useDocumentAudit(documentId);
  const sign = useSign();
  const upload = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  if (!detail) return <PageState query={documentQuery} label="document" />;
  const doc = detail.document;
  const latest = detail.versions[0];
  const statusColor =
    doc.status === "effective"
      ? "var(--status-good)"
      : doc.status === "pending_review"
        ? "var(--info)"
        : "var(--muted)";
  // POST /documents matches by artifact + scope, which is ambiguous for
  // visit-linked documents (two trip reports share both) — no re-version button there.
  const canUploadVersion = doc.status !== "superseded" && !doc.visit_linked;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={doc.study_site_id ? `/sites/${doc.study_site_id}` : "/"}
          className="inline-flex items-center gap-1 text-sm text-ink2 hover:underline"
        >
          <ArrowLeft size={14} aria-hidden />
          {doc.site_number ? `Site ${doc.site_number} — ${doc.site_name}` : "Study"}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{doc.title}</h1>
          <span
            className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={{ color: statusColor, borderColor: "var(--ring)" }}
          >
            {String(doc.status).replace("_", " ")}
          </span>
        </div>
        <div className="mt-1 text-sm text-ink2">
          <span className="mono text-xs">{doc.artifact_code}</span> · {doc.artifact_name}
          {doc.person_given_name && ` · ${doc.person_given_name} ${doc.person_family_name}`}
          {doc.effective_date && ` · effective ${doc.effective_date}`}
          {doc.expires_at && ` · expires ${doc.expires_at}`}
        </div>
      </div>

      <section className="card">
        <div className="flex items-center border-b border-hairline px-4 py-3">
          <h2 className="font-medium">Versions</h2>
          <div className="ml-auto flex items-center gap-2">
            {canUploadVersion && (
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
                        tmfArtifactId: doc.tmf_artifact_id,
                        studyId: doc.study_id,
                        studySiteId: doc.study_site_id,
                        personId: doc.person_id,
                        title: doc.title,
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
                  {upload.isPending ? "Uploading…" : "Upload new version"}
                </button>
              </>
            )}
            {doc.status === "pending_review" && latest && !confirming && (
              <button
                onClick={() => setConfirming(true)}
                disabled={sign.isPending}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ background: "var(--info)" }}
              >
                <PenLine size={13} aria-hidden />
                {sign.isPending ? "Signing…" : "Approve & make effective"}
              </button>
            )}
          </div>
        </div>
        {confirming && latest && (
          <div className="border-b border-hairline bg-page px-4 py-3 text-sm">
            <p className="text-ink2">
              Signing records your name, the date and time, and the meaning
              "approval", bound to this exact version of the file. You'll be
              asked to confirm your identity before the signature is applied.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => {
                  setConfirming(false);
                  setErr(null);
                  sign.mutate(
                    { versionId: latest.id, meaning: "approval" },
                    { onError: (e) => setErr(e) },
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white"
                style={{ background: "var(--info)" }}
              >
                <PenLine size={13} aria-hidden />
                Confirm & sign
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink2 hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <ErrorNote error={err} className="px-4 py-2" />
        <ul className="divide-y divide-hairline">
          {detail.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="rounded bg-page px-1.5 py-0.5 text-xs font-semibold">
                v{v.version_number}
              </span>
              <a
                href={fileUrl(v.sha256)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:underline"
              >
                <Download size={13} aria-hidden />
                {v.file_name}
              </a>
              <span className="text-xs text-muted">
                {(v.size_bytes / 1024).toFixed(1)} kB · uploaded{" "}
                {v.uploader_given_name
                  ? `by ${v.uploader_given_name} ${v.uploader_family_name} `
                  : ""}
                {fmtTime(v.uploaded_at)}
              </span>
              {v.source_system && (
                <span
                  className="rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={{ color: "var(--info)", borderColor: "var(--ring)" }}
                  title={v.source_ref ? `source ref: ${v.source_ref}` : undefined}
                >
                  filed by {v.source_system}
                </span>
              )}
              <span className="mono ml-auto text-xs text-muted" title={`sha256 ${v.sha256}`}>
                {v.sha256.slice(0, 12)}…
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">Signatures</h2>
        {detail.signatures.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No signatures.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {detail.signatures.map((sg) => (
              <li key={sg.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5 text-sm">
                <PenLine size={14} style={{ color: "var(--status-good)" }} aria-hidden />
                <span className="font-medium">
                  {sg.given_name} {sg.family_name}
                  {sg.credentials ? `, ${sg.credentials}` : ""}
                </span>
                <span className="text-xs text-ink2">meaning: {sg.meaning}</span>
                <span className="text-xs text-muted">{fmtTime(sg.signed_at)}</span>
                <span
                  className="ml-auto inline-flex items-center gap-1 text-xs"
                  style={{ color: "var(--status-good)" }}
                  title={`Signature is bound to content hash ${sg.signed_sha256}`}
                >
                  <Link2 size={12} aria-hidden />
                  hash-bound <span className="mono">{sg.signed_sha256.slice(0, 12)}…</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="border-b border-hairline px-4 py-3 font-medium">
          Audit trail{" "}
          <span className="text-xs font-normal text-muted">
            append-only, hash-chained; written by database triggers
          </span>
        </h2>
        <AuditEventList events={audit} />
      </section>
    </div>
  );
}
