# ADR-0009: Blob storage behind a driver interface; WORM via S3 Object Lock

**Status**: accepted · 2026-07-10

## Decision

The content-addressed blob store is a three-method driver interface
(`put`/`get`/`has`, keys are sha256 hashes). Two drivers ship: `local`
(dev directory, the default) and `s3` (any S3-compatible store). In
production the s3 bucket is created with Object Lock and a COMPLIANCE-mode
retention rule, extending the database's trigger-enforced immutability to
the document bytes themselves. MinIO in docker-compose gives dev/test the
same API; one contract test runs against both drivers, and the s3 suite
additionally proves a locked version cannot be deleted even by the root
credential.

## Rationale

- Part 11 §11.10(c) record protection is only as strong as its weakest copy:
  immutable `document_version` rows pointing at deletable files would be
  compliance theater. Object Lock in COMPLIANCE mode is the storage-level
  analogue of `ctms_forbid_mutation()`.
- Content addressing composes cleanly with WORM: an identical re-upload is a
  no-op (same key, same bytes), so retention rules never stack conflicting
  versions, and `signed_sha256` remains verifiable against what storage
  actually holds.

## Consequences

- `putBlob` and friends became async; callers updated.
- The retention window is deployment policy (`S3_OBJECT_LOCK_MODE`,
  `S3_OBJECT_LOCK_RETENTION_DAYS`, or a bucket default rule) — records
  management, not code.
- `pnpm validation:iq` reports which driver an environment runs and fails the
  WORM check if an s3 bucket lacks Object Lock; the local driver is flagged
  as dev-only.
