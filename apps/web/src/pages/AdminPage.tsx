import {
  Building2,
  KeyRound,
  ListPlus,
  MapPinPlus,
  Power,
  RefreshCw,
  UserPlus,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  can,
  useAddStudySite,
  useCreateOrganization,
  useCreatePerson,
  useCreateRule,
  useCreateSite,
  useGrantAccess,
  useMe,
  useOrganizations,
  usePeople,
  useRequirementRules,
  useRevokeGrant,
  useSiteDirectory,
  useSites,
  useSyncExpected,
  useTmfArtifacts,
  useUpdateStudySite,
  type AccessRole,
  type OrgKind,
  type RequirementRule,
  type StaffRole,
  type Study,
} from "../api";
import { ErrorNote, localToday, PageState } from "../ops";

// Study/site/staff administration (ADR-0016): the write surface for the rows
// the seed script used to own. The reads (people, grants, rules, directory)
// render for any reader — "who has access" is an inspector's question — but
// write affordances exist only for a seat holding 'administer' (ADR-0028).
// The API's permission gate stays the authority either way.

const ORG_KIND_LABEL: Record<OrgKind, string> = {
  sponsor: "Sponsor",
  cro: "CRO",
  site_org: "Site organization",
};

const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  admin: "Admin",
  trial_ops: "Trial ops",
  monitor: "Monitor",
  read_only: "Read-only",
  ingest: "Ingest (machine)",
  site_staff: "Site staff",
};

const STAFF_ROLES: StaffRole[] = [
  "principal_investigator",
  "sub_investigator",
  "study_coordinator",
  "pharmacist",
  "research_nurse",
];

const inputCls = "rounded-md border border-hairline bg-surface px-2 py-1 text-xs";
const buttonCls =
  "inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink2 hover:bg-page disabled:opacity-50";

export default function AdminPage({ study }: { study: Study | undefined }) {
  const { data: me } = useMe();
  const admin = can(me, "administer");
  const studiesQuery = { isPending: !study, isError: false, error: null };
  if (!study) return <PageState query={studiesQuery} label="study" />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Administration</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink2">
          Site onboarding, staff, access, and requirement rules for{" "}
          {study.protocol_number}. Every change here is an ordinary audited row —
          the audit trail shows who did what, and endings are dated facts, never
          deletes.
        </p>
      </div>
      <StudySitesSection study={study} admin={admin} />
      <RulesSection study={study} admin={admin} />
      <PeopleSection admin={admin} />
      <DirectorySection admin={admin} />
    </div>
  );
}

function StudySitesSection({ study, admin }: { study: Study; admin: boolean }) {
  const { data: sites } = useSites(study.id);
  const { data: directory } = useSiteDirectory();
  const addSite = useAddStudySite(study.id);
  const update = useUpdateStudySite();
  const sync = useSyncExpected(study.id);
  const [siteId, setSiteId] = useState("");
  const [number, setNumber] = useState("");
  const [err, setErr] = useState<unknown>(null);

  const onStudy = new Set(sites?.map((s) => s.site_name));
  const available = directory?.filter((d) => !onStudy.has(d.name));

  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
        <h2 className="font-medium">Study sites</h2>
        {admin && (
          <button
            onClick={() => {
              setErr(null);
              sync.mutate(undefined, { onError: (e) => setErr(e) });
            }}
            disabled={sync.isPending}
            className={`ml-auto ${buttonCls}`}
            title="Re-materialize expected documents from the requirement rules"
          >
            <RefreshCw size={12} aria-hidden />
            {sync.isPending ? "Syncing…" : "Sync expected documents"}
          </button>
        )}
      </div>
      <ul className="divide-y divide-hairline">
        {sites?.map((s) => (
          <li key={s.study_site_id} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5">
            <span className="text-sm font-medium">
              Site {s.site_number} — {s.site_name}
            </span>
            <span className="text-xs text-ink2">
              {s.status === "active" ? `active since ${s.activated_at}` : s.status}
            </span>
            <span className="ml-auto">
              {admin && s.status === "pending" && (
                <button
                  onClick={() => {
                    setErr(null);
                    update.mutate(
                      {
                        studySiteId: s.study_site_id,
                        status: "active",
                        activatedAt: localToday(),
                      },
                      {
                        onError: (e) => setErr(e),
                        onSuccess: () => sync.mutate(undefined, { onError: (e) => setErr(e) }),
                      },
                    );
                  }}
                  disabled={update.isPending}
                  className={buttonCls}
                >
                  <Power size={12} aria-hidden />
                  {update.isPending ? "Activating…" : "Activate"}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {admin && (
      <form
        className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!siteId || !number.trim()) return;
          setErr(null);
          addSite.mutate(
            { siteId, siteNumber: number.trim() },
            {
              onError: (e) => setErr(e),
              onSuccess: () => {
                setSiteId("");
                setNumber("");
                sync.mutate(undefined, { onError: (e) => setErr(e) });
              },
            },
          );
        }}
      >
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className={inputCls}
          aria-label="Site to add"
        >
          <option value="">Add a site to this study…</option>
          {available?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.city ? ` (${d.city}, ${d.state})` : ""}
            </option>
          ))}
        </select>
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Site number, e.g. 005"
          className={`w-36 ${inputCls}`}
          aria-label="Site number"
        />
        <button type="submit" disabled={addSite.isPending || !siteId} className={buttonCls}>
          <MapPinPlus size={12} aria-hidden />
          {addSite.isPending ? "Adding…" : "Add site"}
        </button>
        <span className="text-xs text-muted">
          New sites start pending; activating one stamps today and syncs its
          expected documents.
        </span>
        <ErrorNote error={err} className="w-full" />
      </form>
      )}
    </section>
  );
}

function RulesSection({ study, admin }: { study: Study; admin: boolean }) {
  const { data: rules } = useRequirementRules(study.id);
  const { data: artifacts } = useTmfArtifacts();
  const create = useCreateRule(study.id);
  const sync = useSyncExpected(study.id);
  const [artifactId, setArtifactId] = useState("");
  const [scope, setScope] = useState<RequirementRule["scope_level"]>("study_site");
  const [name, setName] = useState("");
  const [validity, setValidity] = useState("");
  const [signature, setSignature] = useState(false);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [err, setErr] = useState<unknown>(null);

  return (
    <section className="card">
      <h2 className="border-b border-hairline px-4 py-3 font-medium">
        Requirement rules{" "}
        <span className="text-xs font-normal text-muted">
          what the study expects on file; scope and artifact are fixed after
          creation — a different requirement is a new rule
        </span>
      </h2>
      <ul className="divide-y divide-hairline">
        {rules?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5">
            <span className="mono text-xs text-muted">{r.artifact_code}</span>
            <div className="min-w-0">
              <span className="text-sm">{r.name}</span>
              <div className="text-xs text-muted">
                {r.artifact_name} · {r.scope_level.replace(/_/g, " ")}
                {r.applies_to_roles ? ` (${r.applies_to_roles.join(", ")})` : ""}
                {r.validity_months ? ` · valid ${r.validity_months} mo` : ""}
                {r.requires_signature ? " · signature required" : ""}
              </div>
            </div>
            <span className="ml-auto text-xs text-muted">
              {r.expected_count} expected
            </span>
          </li>
        ))}
      </ul>
      {admin && (
      <form
        className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!artifactId || !name.trim()) return;
          setErr(null);
          create.mutate(
            {
              tmfArtifactId: Number(artifactId),
              scopeLevel: scope,
              name: name.trim(),
              validityMonths: validity ? Number(validity) : undefined,
              requiresSignature: signature,
              appliesToRoles:
                scope === "person_role" && roles.length > 0 ? roles : undefined,
            },
            {
              onError: (e) => setErr(e),
              onSuccess: () => {
                setArtifactId("");
                setName("");
                setValidity("");
                setSignature(false);
                setRoles([]);
                sync.mutate(undefined, { onError: (e) => setErr(e) });
              },
            },
          );
        }}
      >
        <select
          value={artifactId}
          onChange={(e) => setArtifactId(e.target.value)}
          className={`max-w-72 ${inputCls}`}
          aria-label="TMF artifact"
        >
          <option value="">New rule: TMF artifact…</option>
          {artifacts?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} {a.name}
            </option>
          ))}
        </select>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as RequirementRule["scope_level"])}
          className={inputCls}
          aria-label="Rule scope"
        >
          <option value="study">Study</option>
          <option value="study_site">Each site</option>
          <option value="person_role">Each staff member</option>
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rule name, e.g. 'IRB approval on file'"
          className={`w-64 ${inputCls}`}
          aria-label="Rule name"
        />
        <label className="flex items-center gap-1.5 text-xs text-ink2">
          valid
          <input
            type="number"
            min={1}
            value={validity}
            onChange={(e) => setValidity(e.target.value)}
            placeholder="∞"
            className={`w-14 ${inputCls}`}
            aria-label="Validity in months (blank = never expires)"
          />
          mo
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink2">
          <input
            type="checkbox"
            checked={signature}
            onChange={(e) => setSignature(e.target.checked)}
          />
          signature required
        </label>
        {scope === "person_role" && (
          <select
            multiple
            value={roles}
            onChange={(e) =>
              setRoles(
                [...e.target.selectedOptions].map((o) => o.value as StaffRole),
              )
            }
            className={inputCls}
            aria-label="Applies to roles (none selected = all roles)"
            title="Applies to roles — leave unselected for all roles"
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={create.isPending || !artifactId || !name.trim()}
          className={buttonCls}
        >
          <ListPlus size={12} aria-hidden />
          {create.isPending ? "Creating…" : "Create rule"}
        </button>
        <ErrorNote error={err} className="w-full" />
      </form>
      )}
    </section>
  );
}

function PeopleSection({ admin }: { admin: boolean }) {
  const { data: people } = usePeople();
  const grant = useGrantAccess();
  const revoke = useRevokeGrant();
  const createPerson = useCreatePerson();
  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [email, setEmail] = useState("");
  const [credentials, setCredentials] = useState("");
  const [grantPerson, setGrantPerson] = useState("");
  const [grantRole, setGrantRole] = useState<AccessRole>("read_only");
  const [err, setErr] = useState<unknown>(null);

  return (
    <section className="card">
      <h2 className="border-b border-hairline px-4 py-3 font-medium">
        People & access{" "}
        <span className="text-xs font-normal text-muted">
          site staffing (who works where) and access grants (who may call what)
          are separate facts
        </span>
      </h2>
      <ul className="divide-y divide-hairline">
        {people?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="text-sm font-medium">
              {p.given_name} {p.family_name}
              {p.credentials ? `, ${p.credentials}` : ""}
            </span>
            <span className="text-xs text-muted">{p.email}</span>
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              {p.grants.map((g) => (
                <span
                  key={g.grant_id}
                  className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-xs text-ink2"
                >
                  {ACCESS_ROLE_LABEL[g.role]}
                  {g.study_site_id ? " · site" : g.study_id ? " · study" : ""}
                  {admin && (
                    <button
                      onClick={() => {
                        setErr(null);
                        revoke.mutate(
                          { grantId: g.grant_id },
                          { onError: (e) => setErr(e) },
                        );
                      }}
                      disabled={revoke.isPending}
                      aria-label={`Revoke ${g.role} grant`}
                      title="Revoke (sets revoked_at — grants are never deleted)"
                      className="text-muted hover:text-ink"
                    >
                      <X size={11} aria-hidden />
                    </button>
                  )}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {admin && (
      <div className="space-y-2 border-t border-hairline px-4 py-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!grantPerson) return;
            setErr(null);
            grant.mutate(
              { personId: grantPerson, role: grantRole },
              { onError: (e) => setErr(e), onSuccess: () => setGrantPerson("") },
            );
          }}
        >
          <select
            value={grantPerson}
            onChange={(e) => setGrantPerson(e.target.value)}
            className={inputCls}
            aria-label="Person to grant access"
          >
            <option value="">Grant access…</option>
            {people?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.family_name}, {p.given_name}
              </option>
            ))}
          </select>
          <select
            value={grantRole}
            onChange={(e) => setGrantRole(e.target.value as AccessRole)}
            className={inputCls}
            aria-label="Access role"
          >
            {(Object.keys(ACCESS_ROLE_LABEL) as AccessRole[]).map((r) => (
              <option key={r} value={r}>
                {ACCESS_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={grant.isPending || !grantPerson}
            className={buttonCls}
          >
            <KeyRound size={12} aria-hidden />
            {grant.isPending ? "Granting…" : "Grant"}
          </button>
        </form>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!given.trim() || !family.trim() || !email.trim()) return;
            setErr(null);
            createPerson.mutate(
              {
                givenName: given.trim(),
                familyName: family.trim(),
                email: email.trim(),
                credentials: credentials.trim() || undefined,
              },
              {
                onError: (e) => setErr(e),
                onSuccess: () => {
                  setGiven("");
                  setFamily("");
                  setEmail("");
                  setCredentials("");
                },
              },
            );
          }}
        >
          <input
            value={given}
            onChange={(e) => setGiven(e.target.value)}
            placeholder="Given name"
            className={`w-28 ${inputCls}`}
            aria-label="Given name"
          />
          <input
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            placeholder="Family name"
            className={`w-28 ${inputCls}`}
            aria-label="Family name"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.org"
            className={`w-52 ${inputCls}`}
            aria-label="Email"
          />
          <input
            value={credentials}
            onChange={(e) => setCredentials(e.target.value)}
            placeholder="Credentials (MD, CCRC…)"
            className={`w-40 ${inputCls}`}
            aria-label="Credentials (optional)"
          />
          <button
            type="submit"
            disabled={createPerson.isPending || !given.trim() || !family.trim() || !email.trim()}
            className={buttonCls}
          >
            <UserPlus size={12} aria-hidden />
            {createPerson.isPending ? "Creating…" : "Create person"}
          </button>
        </form>
        <ErrorNote error={err} />
      </div>
      )}
    </section>
  );
}

function DirectorySection({ admin }: { admin: boolean }) {
  const { data: orgs } = useOrganizations();
  const createOrg = useCreateOrganization();
  const createSite = useCreateSite();
  const [orgName, setOrgName] = useState("");
  const [orgKind, setOrgKind] = useState<OrgKind>("site_org");
  const [siteName, setSiteName] = useState("");
  const [siteOrg, setSiteOrg] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [err, setErr] = useState<unknown>(null);

  return (
    <section className="card">
      <h2 className="border-b border-hairline px-4 py-3 font-medium">
        Directory{" "}
        <span className="text-xs font-normal text-muted">
          organizations and physical sites, independent of any study
        </span>
      </h2>
      <ul className="divide-y divide-hairline">
        {orgs?.map((o) => (
          <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-sm">{o.name}</span>
            <span className="text-xs text-muted">{ORG_KIND_LABEL[o.kind]}</span>
            <span className="ml-auto text-xs text-muted">
              {o.site_count} site{o.site_count === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
      {admin && (
      <div className="space-y-2 border-t border-hairline px-4 py-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!orgName.trim()) return;
            setErr(null);
            createOrg.mutate(
              { name: orgName.trim(), kind: orgKind },
              { onError: (e) => setErr(e), onSuccess: () => setOrgName("") },
            );
          }}
        >
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="New organization…"
            className={`w-56 ${inputCls}`}
            aria-label="Organization name"
          />
          <select
            value={orgKind}
            onChange={(e) => setOrgKind(e.target.value as OrgKind)}
            className={inputCls}
            aria-label="Organization kind"
          >
            {(Object.keys(ORG_KIND_LABEL) as OrgKind[]).map((k) => (
              <option key={k} value={k}>
                {ORG_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={createOrg.isPending || !orgName.trim()}
            className={buttonCls}
          >
            <Building2 size={12} aria-hidden />
            {createOrg.isPending ? "Creating…" : "Create organization"}
          </button>
        </form>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!siteName.trim() || !siteOrg) return;
            setErr(null);
            createSite.mutate(
              {
                organizationId: siteOrg,
                name: siteName.trim(),
                city: city.trim() || undefined,
                state: state.trim() || undefined,
                country: country.trim().toUpperCase() || undefined,
              },
              {
                onError: (e) => setErr(e),
                onSuccess: () => {
                  setSiteName("");
                  setCity("");
                  setState("");
                  setCountry("");
                },
              },
            );
          }}
        >
          <input
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="New site…"
            className={`w-56 ${inputCls}`}
            aria-label="Site name"
          />
          <select
            value={siteOrg}
            onChange={(e) => setSiteOrg(e.target.value)}
            className={inputCls}
            aria-label="Owning organization"
          >
            <option value="">Organization…</option>
            {orgs?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className={`w-32 ${inputCls}`}
            aria-label="City (optional)"
          />
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="State"
            className={`w-16 ${inputCls}`}
            aria-label="State (optional)"
          />
          {/* ISO 3166-1 alpha-3; the eTMF-EMS <COUNTRYID> for the site's documents (ADR-0024) */}
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="USA"
            maxLength={3}
            className={`w-16 ${inputCls}`}
            aria-label="Country code, ISO 3166-1 alpha-3 (optional)"
          />
          <button
            type="submit"
            disabled={createSite.isPending || !siteName.trim() || !siteOrg}
            className={buttonCls}
          >
            <MapPinPlus size={12} aria-hidden />
            {createSite.isPending ? "Creating…" : "Create site"}
          </button>
        </form>
        <ErrorNote error={err} />
      </div>
      )}
    </section>
  );
}
