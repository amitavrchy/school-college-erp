#!/usr/bin/env bash
# Nightly and pre-deploy database backup for the ERP (Campus One).
# Writes a compressed, encrypted pg_dump and optionally copies it off the host.
# The ERP holds student and guardian records: keep the passphrase and copies outside this server.
#
# Required in .env: DATABASE_URL, BACKUP_PASSPHRASE
# Optional in .env: BACKUP_S3_URI (e.g. s3://bucket/erp), BACKUP_KEEP_DAYS (default 14)
#
# Cron example (02:45 Asia/Dhaka):  45 2 * * * cd /opt/apps/erp && ./scripts/backup.sh nightly >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
label="${1:-manual}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE must be set in .env}"
: "${DATABASE_URL:?DATABASE_URL must be set in .env}"
mkdir -p backups
file="backups/erp-$(date -u +%Y%m%dT%H%M%SZ)-${label}.sql.gz.enc"
docker run --rm --network apps-net -e DATABASE_URL postgres:16-alpine \
  sh -c 'pg_dump --no-owner --format=plain "$DATABASE_URL"' \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$file"
test -s "$file" || { echo "Backup is empty: $file" >&2; exit 1; }
echo "Backup written: $file ($(du -h "$file" | cut -f1))"
if [ -n "${BACKUP_S3_URI:-}" ]; then
  docker run --rm -v "$PWD/backups:/backups:ro" -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
    -e AWS_DEFAULT_REGION -e AWS_ENDPOINT_URL amazon/aws-cli s3 cp "/backups/$(basename "$file")" "$BACKUP_S3_URI/"
  echo "Copied off-host to $BACKUP_S3_URI"
fi
find backups -name 'erp-*.sql.gz.enc' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
