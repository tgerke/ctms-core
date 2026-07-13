import { Archive, Check, CircleDashed, CircleSlash, Hourglass, PenLine, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useBinder, type BinderArtifact, type Study } from "../api";
import { PageState } from "../ops";
import { SpecChip, type StatusSpec } from "../status";

// The TMF binder (ADR-0028): the study's record in the reference model's own
// zone → section → artifact hierarchy — the navigation an inspector expects.
// Everything here is a read of the same derived views the dashboards use;
// there is no binder state to fall out of date.

const DOC_STATUS: Record<string, Omit<StatusSpec, "rank">> = {
  effective: { label: "Effective", icon: Check, cssVar: "--status-good" },
  pending_review: { label: "Pending review", icon: Hourglass, cssVar: "--info" },
  returned: { label: "Returned", icon: Undo2, cssVar: "--status-serious" },
  superseded: { label: "Superseded", icon: Archive, cssVar: "--muted" },
};

export default function BinderPage({ study }: { study: Study | undefined }) {
  const binderQuery = useBinder(study?.id);
  const zones = binderQuery.data;
  const [showEmpty, setShowEmpty] = useState(false);

  if (!zones) return <PageState query={binderQuery} label="binder" />;

  const inUse = (a: BinderArtifact) => a.documents.length > 0 || a.expected_total > 0;
  const filed = zones
    .flatMap((z) => z.sections)
    .flatMap((s) => s.artifacts)
    .reduce((n, a) => n + a.documents.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">TMF binder</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink2">
          {study?.protocol_number}'s trial master file in the reference model's
          own order — zone, section, artifact — the way an inspector pages
          through it. {filed} documents filed. Missing and waived slots show
          beside what was filed; nothing here is a copy that could disagree
          with the record.
        </p>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm text-ink2">
        <input
          type="checkbox"
          checked={showEmpty}
          onChange={(e) => setShowEmpty(e.target.checked)}
        />
        Show artifacts with nothing filed and nothing expected
      </label>

      {zones.map((zone) => {
        const sections = zone.sections
          .map((s) => ({
            ...s,
            artifacts: showEmpty ? s.artifacts : s.artifacts.filter(inUse),
          }))
          .filter((s) => s.artifacts.length > 0);
        if (sections.length === 0) return null;
        return (
          <section key={zone.zone_number} className="card">
            <h2 className="border-b border-hairline px-4 py-3 font-medium">
              Zone {String(zone.zone_number).padStart(2, "0")} — {zone.zone_name}
            </h2>
            {sections.map((section) => (
              <div key={section.section_code}>
                <h3 className="border-b border-hairline bg-page px-4 py-2 text-xs font-medium text-ink2">
                  <span className="mono">{section.section_code}</span> {section.section_name}
                </h3>
                <ul className="divide-y divide-hairline">
                  {section.artifacts.map((a) => (
                    <ArtifactRow key={a.tmf_artifact_id} a={a} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function ArtifactRow({ a }: { a: BinderArtifact }) {
  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="mono text-xs text-muted">{a.artifact_code}</span>
        <span className="text-sm">{a.artifact_name}</span>
        <span className="ml-auto flex items-center gap-2">
          {a.missing_count > 0 && (
            <SpecChip
              spec={{
                label: `${a.missing_count} missing`,
                icon: CircleDashed,
                cssVar: "--muted",
                hollow: true,
              }}
            />
          )}
          {a.waived_count > 0 && (
            <SpecChip
              spec={{
                label: `${a.waived_count} waived`,
                icon: CircleSlash,
                cssVar: "--muted",
              }}
            />
          )}
        </span>
      </div>
      {a.documents.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {a.documents.map((d) => (
            <li key={d.document_id} className="flex flex-wrap items-center gap-x-3 pl-4 text-sm">
              <Link to={`/documents/${d.document_id}`} className="hover:underline">
                {d.title}
              </Link>
              <span className="text-xs text-muted">
                {d.site_number ? `Site ${d.site_number}` : "study-level"}
                {d.person_family_name
                  ? ` · ${d.person_given_name} ${d.person_family_name}`
                  : ""}
                {` · v${d.version_count}`}
                {d.signature_count > 0 && (
                  <span
                    className="ml-1 inline-flex items-center gap-0.5"
                    title={`${d.signature_count} signature${d.signature_count > 1 ? "s" : ""} on record`}
                  >
                    <PenLine size={10} aria-hidden /> {d.signature_count}
                  </span>
                )}
              </span>
              <span className="ml-auto">
                {DOC_STATUS[d.status] && <SpecChip spec={DOC_STATUS[d.status]!} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
