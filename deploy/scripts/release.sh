#!/usr/bin/env bash
# Release order: backup -> pull -> migrate -> up -> health check -> rollback on failure.
# Called by .github/workflows/deploy.yml with IMAGE_TAG set to the verified commit SHA.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${IMAGE_TAG:?IMAGE_TAG is required}"
[ -f .env ] || { echo "::error::.env is missing. Create it from deploy/.env.example first."; exit 1; }
DOCKER=docker
docker info >/dev/null 2>&1 || DOCKER="sudo docker"
$DOCKER network inspect apps-net >/dev/null 2>&1 || $DOCKER network create apps-net
previous="$(cat .deployed_tag 2>/dev/null || echo latest)"

echo "==> Backup before release"
./scripts/backup.sh "pre-${IMAGE_TAG:0:7}"

echo "==> Pull $IMAGE_TAG"
export IMAGE_TAG
for attempt in 1 2 3; do
  $DOCKER compose pull && break
  [ "$attempt" -eq 3 ] && { echo "::error::docker compose pull failed after 3 attempts"; exit 1; }
  echo "docker compose pull failed (attempt $attempt); retrying in 15s..."; sleep 15
done

echo "==> Migrate"
$DOCKER compose run --rm --no-deps -T --interactive=false backend npx prisma migrate deploy </dev/null

echo "==> Start"
$DOCKER compose up -d --remove-orphans

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:4005/api/health >/dev/null && curl -fsS -o /dev/null http://127.0.0.1:3005/; then return 0; fi
    sleep 4
  done
  return 1
}

if healthy; then
  echo "$IMAGE_TAG" > .deployed_tag
  $DOCKER compose ps
  echo "Release $IMAGE_TAG is healthy."
else
  echo "::error::Health check failed for $IMAGE_TAG. Rolling back application containers to $previous."
  $DOCKER compose logs --tail=80 backend worker frontend || true
  IMAGE_TAG="$previous" $DOCKER compose up -d --remove-orphans
  echo "Database migrations are not reversed automatically. Migrations must stay backward compatible (expand, then contract)."
  exit 1
fi
