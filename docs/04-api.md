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
  `dev-monitor-token`, `dev-service-token`) map to seeded people. Demo only.
- **`oidc`** — the token is a JWT from your identity provider
  (`OIDC_ISSUER`/`OIDC_AUDIENCE`); its verified email claim resolves to a
  person record. Any OIDC-compliant IdP works (Okta, Entra ID, Auth0,
  Keycloak). Machine identities (client-credentials tokens with no email
  claim) resolve by subject instead, via `API_SERVICE_SUBJECTS` (ADR-0011).

Either way the identity must hold an `access_grant` row: roles
(`admin`, `trial_ops`, `monitor`, `read_only`, `ingest`) map to operations
(read / upload / sign / approve / administer; `ingest` is read + upload for
source-system filing), optionally scoped to one study or study-site
(ADR-0008). Denials are 403 and name the missing permission.

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
