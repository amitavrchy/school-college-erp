#!/usr/bin/env bash
# Restore drill: decrypts a backup into a throwaway Postgres container and
# checks that core tables are readable. Never touches the live database.
# Usage: ./scripts/restore-drill.sh backups/erp-<stamp>.sql.gz.enc
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
file="${1:?Pass the backup file to restore}"
name="erp-restore-drill-$$"
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill postgres:16-alpine >/dev/null
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 30); do docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$file" | gunzip \
  | docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d drill >/dev/null
for table in '"Organization"' '"User"' '"Student"' '"Invoice"' '"Payment"' '"AdmissionDocument"'; do
  count=$(docker exec "$name" psql -tA -U postgres -d drill -c "SELECT count(*) FROM $table")
  echo "$table rows: $count"
done
echo "Restore drill passed for $file. Encrypted admission documents also need DOCUMENT_ENCRYPTION_KEY from the key backup to be readable."
