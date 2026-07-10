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

Auth: `Authorization: Bearer <token>`; dev tokens in `.env.example`
(`dev-admin-token`, `dev-monitor-token`) map to seeded people.

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

# Approve: Part 11 signature bound to the version's content hash
request("http://localhost:8787") |>
  req_url_path_append("document-versions", version_id, "sign") |>
  req_auth_bearer_token("dev-admin-token") |>
  req_body_json(list(meaning = "approval")) |>
  req_perform()
```

Both calls leave hash-chained audit events attributed to the token's person;
`GET /audit-chain/verify` confirms the chain end-to-end.
