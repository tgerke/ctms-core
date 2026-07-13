# API guide

The API is the product (ADR-0002). The web dashboard consumes only this API —
no private endpoints, no backdoors — so anything the UI can show, a script can
query. The OpenAPI 3.1 spec is generated from the same zod schemas that
validate requests: `http://localhost:8787/openapi.json`, interactive reference
at `http://localhost:8787/docs`.

## Principles

1. **Resources are the relational model** — studies, sites, people, expected
   documents, documents, versions, signatures, audit events. No folder
   metaphors.
2. **Derived status is served, never stored** — `/expected-documents` returns
   the same view the database computes; two clients can never disagree.
3. **Every mutation is attributable** — the bearer token resolves to a person;
   that person lands on every audit event the mutation produces.
4. **Auditability is an endpoint** — `/audit-events`, `/documents/{id}/audit`,
   and `/audit-chain/verify` expose the trail and its integrity check.

Auth: `Authorization: Bearer <token>`. Two modes, selected by `AUTH_MODE`:

- **`dev`** — static tokens from `.env.example` (`dev-admin-token`,
  `dev-monitor-token`, `dev-service-token`, `dev-site-token`) map to seeded
  people. Demo only.
- **`oidc`** — the token is a JWT from your identity provider
  (`OIDC_ISSUER`/`OIDC_AUDIENCE`); its verified email claim resolves to a
  person record. Any OIDC-compliant IdP works (Okta, Entra ID, Auth0,
  Keycloak). Machine identities (client-credentials tokens with no email
  claim) resolve by subject instead, via `API_SERVICE_SUBJECTS` (ADR-0011).

Either way the identity must hold an `access_grant` row: roles
(`admin`, `trial_ops`, `monitor`, `read_only`, `ingest`, `site_staff`) map to
operations (read / upload / sign / approve / administer / log; `ingest` is
read + upload for source-system filing, `site_staff` is the site seat —
ADR-0023), optionally scoped to one study or study-site (ADR-0008). Denials
are 403 and name the missing permission. `GET /me` returns the caller's
person and grants, so a client can decide which surface to render.

## The monitor's morning, from R

The test of "usable by a data-science team": expected-vs-actual for a whole
study as one tidy data frame.

```r
library(httr2)
library(dplyr)

ctms <- function(path, ...) {
  request("http://localhost:8787") |>
    req_url_path_append(path, ...) |>
    req_auth_bearer_token("dev-monitor-token") |>
    req_perform() |>
    resp_body_json(simplifyVector = TRUE) |>
    as_tibble()
}

df_studies  <- ctms("studies")
df_expected <- ctms("studies", df_studies$id[1], "expected-documents")

# Everything that needs attention, most urgent first
df_expected |>
  filter(status != "current") |>
  arrange(factor(status, c("expired", "missing", "pending_review", "expiring_soon"))) |>
  select(site_number, artifact_name, person_family_name, status, effective_expiry)

# Completeness by site, one line
ctms("studies", df_studies$id[1], "sites") |>
  select(site_number, site_name, pct_current, missing_count, expired_count)

# Credential expirations in the next 60 days — the report Florence can't run
df_expected |>
  filter(status == "expiring_soon", scope_level == "person_role") |>
  select(site_number, person_family_name, artifact_name, effective_expiry)
```

No pagination-by-folder, no per-document round trips, no XML exports: the
completeness of a 4-site trial is three GETs.

Finding a specific document is one more
(`GET /studies/{id}/document-search?q=`, ADR-0019 + ADR-0022): every word in
`q` must match the document's metadata (title, artifact taxonomy, site,
person, uploader, file names, filing source) or the extracted text inside
its versions — `q=1572 003` finds site 003's Form FDA 1572, and a phrase
from inside the monitoring plan finds the monitoring plan. Content matches
carry `matched_in_content` and a `content_snippet` of the surrounding text.

The cross-study view is `GET /portfolio` (ADR-0021): one row per study with
completeness counts, attention items, review-queue size, open issues,
overdue visits, and enrollment vs target — the same numbers the study
dashboards derive, grouped. One GET is a portfolio report.

## Writing

```r
# Upload a missing GCP certificate (multipart; lands as pending_review)
request("http://localhost:8787/documents") |>
  req_auth_bearer_token("dev-admin-token") |>
  req_body_multipart(
    file            = curl::form_file("gcp_certificate.pdf"),
    tmf_artifact_id = "18",          # 05.02.03 GCP Training Certificate
    study_id        = df_studies$id[1],
    study_site_id   = site_id,
    person_id       = person_id,
    title           = "GCP Certificate — Oduya"
  ) |>
  req_perform()

# Approve: Part 11 signature bound to the version's content hash.
# §11.200: signing requires re-authentication — in dev mode the bearer token
# restated; in oidc mode a freshly issued token (auth_time within 5 minutes).
request("http://localhost:8787") |>
  req_url_path_append("document-versions", version_id, "sign") |>
  req_auth_bearer_token("dev-admin-token") |>
  req_body_json(list(meaning = "approval", reauth_token = "dev-admin-token")) |>
  req_perform()
```

`approval` is one of three signature meanings — `author` and `review` record
attestations without changing status; only `approval` makes a version
effective and supersedes its non-visit-linked predecessors. Review's other
outcome is `POST /document-versions/{id}/return` with a `reason` (ADR-0015):
the reason is an immutable fact row, the document shows `returned` until a
corrected version arrives, and the returned version can never be approved.
Same `approve` permission as approving; not a signature, so no re-auth. The upload accepts
two optional provenance fields, `source_system` and `source_ref`, for
source-system filing (ADR-0011): filed versions land as `pending_review` like
any upload and show a "filed by" chip in the UI.

The filing surface is complete enough to build an idempotent integration on
(ADR-0025): `force_new=true` makes the upload create a fresh document even
when a non-superseded one with the same artifact and scope exists (an
imported partner record must not merge into a local one),
`POST /documents/{id}/versions` appends a version to exactly that document
(a superseded document answers 409 — closed history stays closed), and
`GET /studies/{id}/filings?source_system=` returns what that source already
filed, `source_ref` by `source_ref`, so a re-run can skip instead of
duplicate. The eTMF-EMS importer (`pnpm import-ems`) is exactly such a
client and nothing more.

Review work routes through the same two outcomes (ADR-0018):
`POST /document-versions/{id}/assign-review` names a reviewer (who must hold
approval authority for the document) with an optional `due_date`, and
`GET /studies/{id}/review-queue` returns every document awaiting review with
its latest assignment and a derived `queue_status`
(`unassigned | assigned | overdue`; filter with `assigned_to` for a "my
work" list). There is no completion call — approving or returning the
version is what clears the queue entry.

The queue's selection acts in bulk (ADR-0026):
`POST /document-versions/bulk-approve` takes `version_ids` and one
`reauth_token` — a §11.200(a)(1)(i) series of signings, one re-authentication
opening the series and each version gaining its own signature bound to its
own content hash — and `POST /document-versions/bulk-return` takes
`version_ids` and one shared `reason`. Both are all-or-nothing: every
version must be the latest of a `pending_review` document the caller may
approve, and a refusal lists every blocker across the selection at once.

Both calls leave hash-chained audit events attributed to the token's person;
`GET /audit-chain/verify` confirms the chain end-to-end, and
`GET /files/{sha256}` returns the exact bytes a signature covers — storage is
content-addressed, so the hash on the signature row is also the retrieval key.

## The CRA's week, from R

The operational layer answers the questions a monitor plans a week around — as flat
data frames, filterable server-side, with every lifecycle stage derived, never stored.

```r
study <- df_studies$id[1]

# Visits needing attention: overdue, or conducted without a trip report
bind_rows(
  ctms("studies", study, "monitoring-visits", "?stage=overdue"),
  ctms("studies", study, "monitoring-visits", "?stage=awaiting_report")
) |>
  select(site_number, visit_type, scheduled_date, visit_date, stage)

# Open action items roll up on the same view the visit page uses
ctms("studies", study, "monitoring-visits") |>
  filter(open_action_items > 0) |>
  select(site_number, visit_type, open_action_items, stage)

# Unresolved major/critical issues, most urgent first
ctms("studies", study, "issues") |>
  filter(status != "resolved", severity %in% c("major", "critical")) |>
  arrange(desc(status == "overdue"), due_date) |>
  select(site_number, category, severity, title, due_date, status)

# Enrollment vs target — which site gets the recruitment call
ctms("studies", study, "enrollment") |>
  select(site_number, enrolled, target_enrollment, pct_of_target, as_of_date)

# Milestones: planned vs actual, drift visible
ctms("studies", study, "milestones") |>
  select(name, site_number, planned_date, actual_date, status)
```

Writes are the same shape — schedule a visit, record a deviation, report counts:

```r
request("http://localhost:8787") |>
  req_url_path_append("studies", study, "issues") |>
  req_auth_bearer_token("dev-admin-token") |>
  req_body_json(list(
    study_site_id = site_id, category = "protocol_deviation", severity = "major",
    title = "Dosing outside window, subject 002-011",
    identified_date = as.character(Sys.Date()),
    due_date = as.character(Sys.Date() + 14)
  )) |>
  req_perform()
```

Visit facts (conducted date, monitor, summary, a new scheduled date) are
`PATCH /monitoring-visits/{id}` — the derived stage recomputes.
`POST /monitoring-visits/{id}/document-links` attaches an already-filed
document to a visit (`link_kind`: `trip_report`, `confirmation_letter`,
`follow_up_letter`). When requirement rules or role assignments change, an
admin re-runs `POST /studies/{id}/sync-expected-documents` — idempotent:
inserts what's newly expected, prunes unfulfilled placeholders that no longer
apply.

## Onboarding a site (ADR-0016)

Studies, sites, people, roles, grants, and requirement rules are ordinary
audited rows with a write surface — no seed script or SQL needed. All admin
mutations require the `administer` operation (the `admin` role); directory
reads (`GET /organizations`, `/sites`, `/people`, `/tmf-artifacts`,
`/studies/{id}/requirement-rules`) are ordinary reads. The whole onboarding
sequence, as an admin:

```r
adm <- function(path, body) {
  request("http://localhost:8787") |>
    req_url_path_append(path) |>
    req_auth_bearer_token("dev-admin-token") |>
    req_body_json(body) |> req_perform() |> resp_body_json()
}

org  <- adm("organizations", list(name = "Cascade Clinical Research", kind = "site_org"))
site <- adm("sites", list(organization_id = org$id, name = "Cascade Clinical Research",
                          city = "Boise", state = "ID"))
ss   <- adm(paste0("studies/", study, "/sites"),
            list(site_id = site$id, site_number = "005"))

# Activation is a PATCH; staffing is a dated fact; access is a separate grant.
request("http://localhost:8787") |>
  req_url_path_append("study-sites", ss$id) |>
  req_auth_bearer_token("dev-admin-token") |>
  req_body_json(list(status = "active", activated_at = as.character(Sys.Date()))) |>
  req_method("PATCH") |> req_perform()

pi <- adm("people", list(given_name = "Ada", family_name = "Okafor",
                         email = "ada.okafor@cascade.example", credentials = "MD"))
adm(paste0("study-sites/", ss$id, "/roles"),
    list(person_id = pi$id, role = "principal_investigator",
         start_date = as.character(Sys.Date())))
adm("access-grants", list(person_id = pi$id, role = "read_only", study_id = study))

# Materialize the new site's (and PI's) expected documents.
request("http://localhost:8787") |>
  req_url_path_append("studies", study, "sync-expected-documents") |>
  req_auth_bearer_token("dev-admin-token") |>
  req_method("POST") |> req_perform()
```

Endings are facts, never deletes: `PATCH /study-site-roles/{id}` sets an
`end_date`, `POST /access-grants/{id}/revoke` sets `revoked_at`. Creating or
revoking an *unscoped* grant requires an equally unscoped `administer` grant,
so a site-scoped admin cannot mint global access. Requirement rules are
`POST /studies/{id}/requirement-rules` and `PATCH /requirement-rules/{id}`;
a rule's scope level and artifact are fixed after creation — a different
requirement is a new rule.

When an expected document genuinely does not apply ("central IRB — no local
approval letter"), waive it instead of leaving a permanent gap:

```r
adm(paste0("expected-documents/", expected_id, "/waive"),
    list(reason = "Central IRB of record; local approval letter not applicable."))
```

The row shows `waived` where it would have shown `missing`, leaves the
completeness denominator, and carries who/when/why on the view. A filed
document always beats the waiver, and
`POST /expected-documents/{id}/revoke-waiver` (reason required) lifts it as a
recorded fact — the waiver history is never deleted (ADR-0016).

## The site seat (ADR-0023)

A person whose grant is `site_staff` scoped to one study-site works entirely
through site-scoped endpoints — study-wide reads (including `/portfolio`) are
403 for them. `GET /study-sites/{id}` is the landing read (site, study
context, completeness rollup); `/expected-documents`, `/enrollment`, `/staff`
hang off the same path. The structured logs live beside the signed documents:

```r
site <- function(path, ...) {
  request("http://localhost:8787") |>
    req_url_path_append("study-sites", ss_id, path, ...) |>
    req_auth_bearer_token("dev-site-token") |>
    req_perform() |> resp_body_json(simplifyVector = TRUE) |> as_tibble()
}

# The DoA log with its derived cross-checks: is the authorizer really the
# active PI, and does the delegate have open credential items?
site("delegation-log") |>
  filter(status == "active", credential_open_items > 0 | !authorizer_was_pi) |>
  select(family_name, delegated_tasks, start_date,
         authorizer_was_pi, credential_open_items)

# Training with derived expiry — same 60-day window as documents
site("training-log") |>
  filter(status != "current") |>
  select(family_name, topic, trained_on, expires_at, status)
```

Writes take the `log` operation (`site_staff` or `admin` — a monitor reads
the logs but never authors a site's own record):
`POST /study-sites/{id}/delegation-log` (`person_id`, `delegated_tasks[]`,
`start_date`, `authorized_by`), `PATCH /delegations/{id}` with an `end_date`
(entries are never deleted), and `POST /study-sites/{id}/training-log`
(`person_id`, `topic`, `trained_on`, optional `expires_at` and a
`document_id` linking the filed certificate). The signed DoA log document
(artifact 05.03.01) stays the authoritative Part 11 record; the rows are the
queryable layer beside it, and every write is a hash-chained audit event
attributed to the site person.

## Skip the API entirely: the views are the contract

The `v_*` views are documented public surface (see `02-data-model.md`). With a
read-only Postgres role, dbplyr composes against the same derived truth the dashboard
shows — no export, no sync, no drift:

```r
con <- DBI::dbConnect(RPostgres::Postgres(),
  host = "localhost", port = 5433, dbname = "ctms",
  user = "ctms_readonly", password = "ctms_readonly")  # dev role, created by seed

dplyr::tbl(con, "v_monitoring_visit_status") |>
  dplyr::filter(stage %in% c("overdue", "awaiting_report")) |>
  dplyr::left_join(dplyr::tbl(con, "v_site_enrollment"),
                   by = c("study_id", "study_site_id", "site_number", "site_name")) |>
  dplyr::select(site_number, visit_type, stage, enrolled, target_enrollment) |>
  dplyr::collect()
```
