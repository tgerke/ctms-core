# ADR-0008: Provider-agnostic OIDC for identity; grants in the data model for authorization

**Status**: accepted · 2026-07-10

## Decision

1. Authentication is standard OIDC bearer-JWT validation (issuer, audience,
   JWKS) with no provider SDK: any compliant IdP (Okta, Entra ID, Auth0,
   Keycloak) works via three env vars. The token's verified email claim
   resolves to a `person` row; an authenticated identity with no person record
   is refused (403), never given a fallback actor. The old dev-token map
   survives behind an explicit `AUTH_MODE=dev`; the API refuses to boot with
   no mode chosen.
2. Authorization is rows, not middleware config: `access_grant`
   (person, role, optional study/site scope, `revoked_at`) with a fixed
   role→operation map in one place (`packages/core/src/authz.ts`:
   admin / trial_ops / monitor / read_only over read / upload / sign /
   approve / administer). Site vs. sponsor stays a permission scope, not a
   different data model (ADR-0001).
3. Signing re-authentication (§11.200): the sign endpoint demands a
   `reauth_token` — in OIDC mode a freshly issued token for the same subject
   whose `auth_time` is inside `REAUTH_MAX_AGE_SECONDS` (default 300); the
   method and time land on the signature row, and a `NOT VALID` CHECK makes
   them mandatory for every new signature while stating the honest null for
   rows that predate the ceremony.

## Rationale

- CRO/pharma vendor assessments start at SSO and role separation; a static
  token map fails the first question. Provider-agnostic OIDC means the
  customer's existing IdP is the integration, not a per-customer build.
- Grants as audited rows make access reviews a query — the same thesis the
  product applies to documents ("who can approve at site 002, and since
  when?" is a `SELECT`, and every change to the answer is in the audit trail).
  Revocation is a timestamp, so grant history is reconstructable.
- Fresh-token-with-`auth_time` is the standard OIDC step-up pattern for
  re-authentication and keeps credentials (passwords, MFA) entirely the IdP's
  concern — the system never sees or stores them.

## Consequences

- The web app runs an authorization-code + PKCE flow with a `prompt=login`
  popup at signing time; in dev mode both collapse to the static token.
- Unscoped read endpoints (`/studies`, `/audit-events`) are open to any
  active grant holder; study/site scoping binds on resource-keyed routes.
  A site-facing surface with per-site read filtering remains future work.
- Tests exercise the full OIDC path against a mock IdP (local JWKS + minted
  JWTs), so no external identity service is needed in CI.
