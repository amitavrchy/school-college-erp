# School & College ERP — Performance & Scalability

**Capacity is NOT VERIFIED.** No load test was executed. Static assessment and workload model only; the k6 plan is in `../testing/load-testing-plan.md`.

## 1. Usage model (assumptions)

"10,000 registered users" here includes staff, guardians and students. A 500-student school with guardian accounts has roughly 500–1,000 accounts, so 10,000 users is on the order of **10–20 small schools** — or fewer if large. In practice guardian portal adoption is partial; the heavy users are teachers (attendance each morning) and accounts staff.

The plan limits in code (`saas/policy.ts`) allow up to 10,000 students per Scale organisation, so student volume, not account count, drives data size.

| Stage | Registered users | Institutions (assumed) | Peak concurrent (assumed) | Peak API req/s (assumed) |
|---|---:|---:|---:|---:|
| Early | 100 | 1 | 10–20 | ~2 |
| Traction | 1,000 | 2–4 | 80–150 | ~10–15 |
| Growth | 5,000 | 8–15 | 300–600 | ~40–60 |
| Target | 10,000 | 15–30 | 600–1,200 | ~80–120 |

Peaks are sharp and predictable:

- **Morning attendance** (08:00–09:30): every class teacher posts one bulk request; each triggers a campus-wide refresh event.
- **Result publication:** most guardians and students open results within an hour.
- **Fee deadlines** (around the 10th): guardian views and counter payments.
- **Admission season:** public application bursts.

Read/write ratio roughly 80/20 outside attendance windows.

Data volume (assumed 10,000 students total): attendance ≈ 10,000 rows per school day ≈ 2.2 million per year; marks ≈ 10,000 × 10 subjects × 3 terms = 300,000 per year; invoices ≈ 120,000 per year plus lines and allocations. Database size without files: a few GB per year. **With files in the database** (admission documents up to 25 MB per applicant, website media) size is dominated by binaries.

## 2. Static bottlenecks (ranked)

| # | Bottleneck | Evidence | Effect |
|---|---|---|---|
| 1 | Maintenance job every minute scans all due invoices for all tenants | `jobs.ts:213-233` | Linear in total unpaid invoices, 1,440 times a day |
| 2 | Month-start billing storm: every structure regenerated every minute on the 1st, with per-student queries | `jobs.ts:235-246`, `billing.ts:31-69` | Hours of redundant load; can starve the 10-connection pool and produce 503s for users |
| 3 | Global refresh: each `refresh` socket event makes every mounted hook on every staff client refetch | `frontend/src/components/shell.tsx:213-221`, `lib/use-data.ts:28-36` | Attendance burst multiplies read load across all open screens |
| 4 | Guard cost: user + roles + campus, membership, and (for writes) organisation + subscription + plan on each request | `auth/access.ts:72-123` | 2–3 extra queries per request; cacheable for 30–60 s |
| 5 | Worker shares the API process and its database pool (limit 10) | `jobs.ts:62-80`, `db.ts:8` | Jobs compete with requests |
| 6 | Files read from and written to PostgreSQL as whole buffers; 8 MB JSON bodies | `uploads.ts`, `main.ts:15` | Memory spikes within a 416 MB container |
| 7 | pdfkit generation in the request thread | `documents.ts`, `saas/controllers.ts:143-173` | Bulk report-card generation would block the event loop |
| 8 | In-memory rate-limit store and Socket.IO without a Redis adapter | `main.ts`, `realtime.ts` | Blocks a second instance |
| 9 | School-site host resolution call per page view | `frontend/src/proxy.ts:32-36` | Extra latency on public sites |
| 10 | bcrypt cost 12 on login | `auth.controller.ts` | Morning login burst uses the libuv pool; acceptable, monitor |

## 3. Scaling readiness

| Requirement | Status |
|---|---|
| Stateless API | Session is a cookie; rate limits and sockets are per process |
| Horizontal scaling | Needs Redis store for `express-rate-limit`, Socket.IO Redis adapter, worker split out |
| Connection pooling | Explicit: 10 connections, 15 s pool timeout, 503 + `Retry-After` on exhaustion — good basis; raise with instance size |
| Background jobs | BullMQ with retries and de-duplication — good; wrong process and schedule |
| Health checks | Liveness and readiness (database + Redis) — good |
| Graceful shutdown | Hooks enabled; worker and queue closed on destroy |
| Caching/CDN | None; school sites and media would benefit most |

## 4. What 10,000 users needs

This workload fits one API instance (2 vCPU / 4 GB) plus one worker process and a small managed PostgreSQL, **after**:

1. Maintenance split into scheduled jobs: notice dispatch (every minute, indexed), fines (once daily per organisation, set-based SQL), monthly billing (once per structure with a "generated for month" marker), reminders (daily), offer expiry (every 5–10 minutes).
2. Worker in its own container with its own pool.
3. Event-scoped client refresh.
4. Guard context cached per user for 30–60 s (invalidate on role/subscription change).
5. Files moved to object storage; streaming uploads.
6. Bulk PDF generation as background jobs with downloadable results.
7. Redis-backed rate limiting and socket adapter before adding a second instance.
8. Indexes from `database-audit.md` §4.

Kubernetes, microservices or read replicas are not needed at this scale. Consider a read replica only if reporting queries begin to affect attendance latency.

## 5. Targets to verify

| Scenario | Target |
|---|---|
| Attendance bulk save (50 students) | p95 < 400 ms |
| 200 teachers saving attendance within 10 minutes | error rate < 0.5 %, no 503 |
| Result day: 1,000 guardians in 15 minutes | p95 < 600 ms, p99 < 1.5 s |
| Fee payment (manual) | p95 < 500 ms; zero double allocation |
| Guardian dashboard | p95 < 500 ms |
| Report card PDF | p95 < 1.5 s single; bulk via job |
| DB pool utilisation at peak | < 70 % |

Workload mix: attendance 25 %, student/guardian portal reads 35 %, fee views and payments 15 %, results 15 %, admin/report 10 %; plus an admission-form burst scenario and a month-start billing scenario run against a copy with 10,000 students.
