# ADR-0017: Digest notifications are a stateless job over the derived views

Date: 2026-07-11. Status: accepted.

## Context

Nothing emailed anyone: expiring credentials, overdue visits, overdue action
items and issues, and a broken audit chain were all visible in the UI and
the `v_*` views, but only to someone who looked. The roadmap ranked a digest
as the highest oversight value per unit effort, because the derived-status
design (ADR-0004/0006) means there is no notification state to maintain —
only a query to run and send.

Incumbent notification systems carry per-user subscriptions, read receipts,
and delivery logs. That is a second stateful system that can drift from the
record it summarizes — the exact failure mode this project exists to avoid.

## Decision

1. **The digest is a pure function of the views at send time.**
   `pnpm digest` (tools/digest.ts, composition in
   `packages/core/src/digest.ts`) queries `v_expected_document_status`,
   `v_monitoring_visit_status`, `v_issue_status`, `v_milestone_status`, the
   open action items, and the audit-chain verification, renders one
   plain-text email per study, and exits. No notification table, no sent
   log, no read state — rerunning it is always safe and always current.
2. **Scheduling belongs to the operator; delivery belongs to the mail
   system.** Cron (or any platform scheduler) decides cadence; `SMTP_URL`
   names the relay. The job does not schedule itself, retry, or track
   delivery — the mail infrastructure already does those jobs with an
   audit trail of its own.
3. **Recipients are derived from access grants, not a subscription list.**
   Everyone holding an active `admin` or `trial_ops` grant that covers the
   whole study (unscoped or study-scoped) receives it; site-scoped grants
   are excluded — a per-site digest is a different, smaller report.
   `DIGEST_TO` overrides the derivation for pilots and testing.
4. **A broken audit chain leads the email.** The digest is the one place a
   chain failure reaches someone who was not looking; it is reported above
   everything else and counted in the subject line.
5. **Dev/test parity via mailpit** in docker-compose (SMTP :1025, inbox UI
   :8025), the same pattern MinIO provides for the s3 storage driver.

## Consequences

- The team's morning email answers "what needs attention" without anyone
  opening the dashboard, and it can never disagree with the dashboard —
  both are the same `SELECT`s.
- There is no in-app notification center, no per-user preferences, and no
  "notification sent" audit record. Deliberate: the mail system logs
  delivery, and the record itself never depended on the email.
- The digest date is computed in the server's local time zone (same
  rationale as the web app's local-time 'today' defaults): an evening cron
  run must not claim tomorrow's date.
- The roadmap's "Notifications and scheduled reports" gap closes in this
  change; what remains of it is the narrower per-user subscription and
  flash-report scheduling UI incumbents ship.
