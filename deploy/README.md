# EC2 deployment (School & College ERP — slug `erp`)

Every push to `main` (or a manual *Run workflow*) runs `.github/workflows/deploy.yml`:

1. Builds `backend/Dockerfile` and `frontend/Dockerfile` (contexts `backend/` and `frontend/`) with
   Buildx + GHA cache and pushes `ghcr.io/amitavrchy/erp-backend` and `ghcr.io/amitavrchy/erp-frontend`
   tagged `latest` and the commit SHA.
2. SSHes to the server (`EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` secrets), copies
   `deploy/docker-compose.prod.yml` to `/opt/apps/erp/docker-compose.yml` and `deploy/scripts/*.sh`
   to `/opt/apps/erp/scripts/`, logs in to GHCR with the workflow token and runs `scripts/release.sh`:
   encrypted pre-release backup → pull (with retries) → `npx prisma migrate deploy` in a one-off
   backend container → `docker compose up -d` → health check of `/api/health` and the frontend →
   on failure the application containers roll back to the previously deployed tag (migrations are
   not reversed; keep them backward compatible), then `docker image prune -f`.

| Service  | Container      | Host port        | Public URL                                   |
|----------|----------------|------------------|----------------------------------------------|
| frontend | `erp-frontend` | `127.0.0.1:3005` | https://erp.13.203.3.1.sslip.io               |
| backend  | `erp-backend`  | `127.0.0.1:4005` | https://api.erp.13.203.3.1.sslip.io (prefix `/api`, health `/api/health`) |

The browser only talks to the frontend origin: `/api/*` (including Socket.IO at `/api/socket.io`) is
proxied by Next.js to `http://erp-backend:4000` over `apps-net` (`API_INTERNAL_URL` build arg + runtime env).

## Requirements

- `shared-postgres` with an `erp` role/database, `shared-redis` (Valkey, db 4), and the `apps-net` network.
- **Redis is required**: BullMQ jobs (SMS, absence alerts, maintenance) run in the API process and `/api/health` pings it.
- `/opt/apps/erp/.env` created from `deploy/.env.example` (`chmod 600`).

## Upgrade notes — security hardening (Stage 1)

Before deploying this release, add to `/opt/apps/erp/.env`:

| Variable | Why |
|---|---|
| `DOCUMENT_ENCRYPTION_KEY` | **Now required in production** — the API refuses to start without it. If documents were uploaded while it was empty, they stay readable (the old derived key is kept for decryption only). Generate with `openssl rand -hex 32`. |
| `TRUST_PROXY=loopback,uniquelocal` | Rate limits now key on the real client address; without this every user behind Nginx shares one bucket. |
| `EMAIL_PROVIDER` / `SMS_PROVIDER` | Self-service sign-up and password reset send one-time codes. With both on `console`, codes are not delivered and new schools cannot sign up. |
| `MFA_ENFORCE` (optional) | Leave `false` until platform admins and school SUPER_ADMINs have enrolled under Settings → Account, then set `true`. |

Deploys now run only after the `CI` workflow passes on `main` (typecheck, unit, integration and browser tests).

## Upgrade notes — background worker and school settings (Stage 2)

- A new `erp-worker` container (same backend image, `node dist/worker.js`) runs notices, daily
  fines (01:00 Dhaka), monthly billing, fee reminders, seat-offer expiry and SMS delivery. The
  API container sets `RUN_JOBS=false` and only enqueues. Both need the same `.env`.
- Fine, discount, due day, reminder, offer window and receipt branding are now per school under
  Settings → School policy. The old `FEE_FINE_PER_DAY_MINOR`, `SIBLING_DISCOUNT_BPS`,
  `FEE_REMINDERS_ENABLED` and `ADMISSION_OFFER_HOURS` values remain only as defaults for schools
  that have not saved a policy.
- The migration suffixes duplicate roll numbers within a section (e.g. `12-2`) before adding a
  uniqueness rule, and backfills `TimetableSlot.sessionId` from each slot's section.

## Backups and restore drill

`scripts/backup.sh [label]` writes an AES-256 encrypted `pg_dump` to `/opt/apps/erp/backups/` and,
when `BACKUP_S3_URI` is set, copies it off the host. Set `BACKUP_PASSPHRASE` in `.env` and keep a
copy of the passphrase **and** `DOCUMENT_ENCRYPTION_KEY` outside the server; without them the dump
and the encrypted admission documents are unreadable. Schedule it nightly:

```
45 2 * * * cd /opt/apps/erp && ./scripts/backup.sh nightly >> backups/backup.log 2>&1
```

`scripts/restore-drill.sh backups/<file>` restores a dump into a throwaway Postgres container and
counts core tables. Run it after the first production backup and at least monthly; record the
result. Redis (Valkey) holds only queued jobs; after a restore, reconcile queued SMS/notices.

## First admin

Platform owner only (no demo data):

```bash
cd /opt/apps/erp
docker compose run --rm -T backend npm run platform:bootstrap </dev/null   # needs PLATFORM_ADMIN_EMAIL + PLATFORM_SEED_PASSWORD
```

Demo school (`admin@campusone.edu.bd`, `principal@…`, `teacher@…` etc. + platform owner):

```bash
docker compose run --rm -T backend npm run db:seed </dev/null               # needs SEED_PASSWORD (>= 12 chars)
```

## School websites / custom domains

- Built-in subdomains: `<subdomain>.erp.13.203.3.1.sslip.io` (`SCHOOL_SITE_BASE_DOMAIN`). sslip.io resolves
  them; host Nginx needs a vhost for the hostname and a TLS certificate per school subdomain
  (`sudo certbot --nginx -d <subdomain>.erp.13.203.3.1.sslip.io`), because Let's Encrypt wildcard certs
  need DNS-01 which sslip.io can't do.
- Custom school domains need a real platform domain for `SCHOOL_SITE_CNAME_TARGET` plus on-demand TLS
  (e.g. Caddy `on_demand_tls` asking `/api/public-websites/tls-authorization`, see `backend/setup/Caddyfile`)
  or a manual certbot run per domain. Not set up on the shared host yet.
