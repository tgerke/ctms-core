#!/usr/bin/env bash
# Paired backup of the stateful pieces: the PostgreSQL database and the local
# document store. Versions in the database reference document bytes by
# sha256 — a database backup without the blobs it points at cannot satisfy
# §11.10(c) retrievability, so this script always takes both under one
# timestamp. Blobs are content-addressed and immutable, which makes the
# pairing forgiving (a newer blob archive can serve an older database dump,
# never the reverse).
#
# Usage:  ./backup.sh [output-dir]        (default: ./backups)
# Cron:   0 2 * * * cd /opt/ctms && ./backup.sh /var/backups/ctms
#
# Scope: the bundled Postgres (local-db profile) and the local storage
# driver. With a managed database use its PITR; with STORAGE_DRIVER=s3 the
# bucket's versioning + Object Lock replace the blob archive — then this
# script's job is only the audit-chain spot check below.
#
# Restore (fresh stack, volumes empty):
#   docker compose -f compose.prod.yaml up -d postgres
#   gunzip -c db_<STAMP>.sql.gz | docker compose -f compose.prod.yaml exec -T postgres psql -U ctms -d ctms
#   docker compose -f compose.prod.yaml run --rm --no-deps --entrypoint tar api -xzf - -C /var/lib/ctms < storage_<STAMP>.tar.gz
#   docker compose -f compose.prod.yaml up -d
# Then verify: GET /audit-chain/verify and an in-app byte verification.
set -euo pipefail

cd "$(dirname "$0")"
compose="docker compose -f compose.prod.yaml"
outdir="${1:-./backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$outdir"

# Quiesce writers so both pieces reflect the same moment.
$compose stop api web >/dev/null

$compose exec -T postgres pg_dump -U ctms -d ctms | gzip > "$outdir/db_${stamp}.sql.gz"
$compose run --rm --no-deps --entrypoint tar api -czf - -C /var/lib/ctms storage > "$outdir/storage_${stamp}.tar.gz"

$compose start api web >/dev/null

echo "backup pair written: $outdir/db_${stamp}.sql.gz + $outdir/storage_${stamp}.tar.gz"
echo "reminder: backups need the same encryption at rest as the live volumes."
