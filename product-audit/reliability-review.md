# School & College ERP — Reliability & Operations Review

Sources: Dockerfiles, `deploy/*`, `.github/workflows/deploy.yml`, `backend/compose.yaml`, `backend/setup/*`, `backend/docs/OPERATIONS.md` (opening sections). The EC2 host was not inspected.

## 1. Current state

| Area | Finding | Evidence |
|---|---|---|
| Images | Multi-stage; non-root; runtime image includes dev dependencies and sources for seeds/bootstrap | `backend/Dockerfile` |
| Compose | `backend` with Node-based health check on `/api/health`, 416 MB limit; `frontend` 320 MB; restart policy; log rotation | `deploy/docker-compose.prod.yml` |
| Dependencies | Shared Postgres and shared Redis-compatible store (database 4); both required | `deploy/.env.example` |
| Health | `/api/health/live` and readiness `/api/health` covering database and Redis with a 2.5 s timeout | `backend/src/health.ts` |
| Deploy | Pull with three retries → `prisma migrate deploy` → `up -d` (correct order) | `.github/workflows/deploy.yml:111-123` |
| CI | Not active | `backend/automation/workflows/ci.yml` |
| Bootstrap | `npm run platform:bootstrap` creates plans and the platform admin without demo data | `backend/setup/bootstrap.ts`, `deploy/.env.example` |
| Backups | None found in repository or deploy docs read | — |
| Monitoring / alerting / error tracking | None found | — |
| Jobs | In-process worker; if Redis is unreachable at start, queue calls wait indefinitely (`maxRetriesPerRequest: null`) and readiness reports unavailable | `backend/src/jobs.ts:14-28`, `:62-80` |
| Domain | `erp.13.203.3.1.sslip.io`; tenant sites use subdomains of the same; custom domains unavailable until a real domain is configured | `deploy/.env.example` |
| TLS for tenant domains | A `tls-authorization` endpoint exists for on-demand certificates and a `Caddyfile` is provided | `websites/controllers.ts:133`, `backend/setup/Caddyfile` — NOT VERIFIED in detail |

## 2. Risks

| ID | Class | Risk | Impact |
|---|---|---|---|
| R-R1 | CONFIRMED ARCHITECTURAL WEAKNESS | No backups | Loss of student records, results and fee ledgers |
| R-R2 | CONFIRMED BUG | Untested auto-deploy | Regressions and malicious commits reach production |
| R-R3 | CONFIRMED ARCHITECTURAL WEAKNESS | Single shared host, Postgres and Redis for three products | Correlated outages; noisy-neighbour effects from this product's month-start job |
| R-R4 | CONFIRMED BUG | Month-start and every-minute job load (R-B1) | Pool exhaustion → 503 for users on the 1st |
| R-R5 | CONFIRMED ARCHITECTURAL WEAKNESS | Worker inside the API | Deploys interrupt SMS and offer processing; job CPU affects request latency |
| R-R6 | POTENTIAL RISK | Redis outage makes readiness fail and blocks public-form rate limiting (requests rejected with 503) | Admission form unavailable while Redis is down — acceptable fail-closed, but needs alerting |
| R-R7 | CONFIRMED ARCHITECTURAL WEAKNESS | No monitoring | Problems reported by schools first |
| R-R8 | POTENTIAL RISK | Files in the database | Slow backups/restores once uploads accumulate |
| R-R9 | POTENTIAL RISK | Deploy during school hours | Attendance and fee counters interrupted |

## 3. Targets

| Objective | Launch target | Rationale |
|---|---|---|
| Availability | 99.5 % overall; 99.9 % during 07:30–16:00 Dhaka on school days | Attendance and fee counters |
| RPO | ≤ 15 minutes | Fee and result records |
| RTO | ≤ 2 hours | Schools can fall back to paper for a morning |
| Deploy window | After 18:00 Dhaka or weekends; freeze during exam result days and month start | — |

## 4. Required work

1. Managed PostgreSQL with automated backups and point-in-time recovery, dedicated to this product; nightly logical dump to a second location; restore drill each term.
2. Active CI running unit, integration and Playwright suites; staging; approval step; rollback by image tag.
3. Separate worker container; fix job schedules; alert on queue backlog and failed jobs.
4. Monitoring: uptime probes on `/api/health` and the login page; error tracking; alerts for 5xx rate, 503 pool exhaustion, job failures, disk and memory.
5. Real domain with wildcard DNS and TLS for tenant subdomains; documented custom-domain procedure.
6. Object storage for documents and media with lifecycle rules.
7. Runbooks: restore, rollback, Redis loss, SMS provider failure, payment reconciliation, tenant suspension, result-day checklist.
8. Per-tenant export on request and a tested account/organisation closure procedure.

## 5. Failure-mode review

| Failure | Current behaviour | Desired |
|---|---|---|
| Postgres pool exhausted | 503 with `Retry-After: 5` (`common.ts:39-61`) | Same, plus alert and capacity headroom |
| Redis down | Readiness fails; jobs stall; public forms return 503 | Alert within minutes; authenticated ERP keeps working (it does) |
| SMS provider down | Job retries 5× then `FAILED` status; visible in SMS log | Alert + manual resend |
| Gateway timeout | 503 to payer; pending payment row remains | Expire stale pending rows; reconciliation report |
| Bad deploy | New code after migration; no automatic rollback | Health-gated rollout with rollback |
| Operator error | No recovery | PITR |

## 6. Verification

- Restore drill into a scratch database followed by `test/run-integration.mjs`.
- Simulate the 1st of the month on staging with 10,000 students and confirm p95 latency of attendance saves is unaffected.
- Stop Redis for five minutes: authenticated pages keep working, alert fires, jobs resume afterwards.
