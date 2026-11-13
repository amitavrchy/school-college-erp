# Fixing Master Prompt — school-college-erp ("Campus One")

Paste into a coding-agent session at the repository root. Work stage by stage; each numbered task is one reviewable pull request.

---

## Context

**Campus One** is a multi-tenant school and college management SaaS for Bangladesh: admissions, students, attendance, exams and results, fees and payments, notices/SMS, guardian portal, optional library/transport/homework/support modules, tenant school websites, and a platform console with subscription plans.

**Stack (verified):**

- `backend/`: NestJS 11, Prisma 6.19, PostgreSQL, Redis (required), zod, `@nestjs/jwt` (cookie `campus_session` or Bearer; `tokenVersion` revocation), bcryptjs, `express-rate-limit`, BullMQ (worker currently inside the API, `src/jobs.ts`), socket.io gateway (`src/realtime.ts`), pdfkit. Node ≥ 22. Scripts: `npm run typecheck`, `npm test` (unit), `npm run test:integration` (needs Postgres + Redis), `npm run verify`.
- `frontend/`: Next.js App Router (standalone), React, plain CSS, `src/proxy.ts` host routing for tenant sites, Playwright (`e2e/`, includes axe checks). Scripts: `npm run typecheck`, `npm run test:e2e`.
- `deploy/` + `.github/workflows/deploy.yml`: GHCR → EC2 Docker Compose; migrations run before `up -d`.

**Architecture:** `backend/src/app.module.ts` registers 24 controllers and providers `Db`, `Saas`, `Scope`, `Audit`, `Realtime`, `Jobs`, `Billing`, `PaymentService`, `Websites`, `WebsiteResults`; global `AccessGuard` (`src/auth/access.ts`) with decorators `@Public`, `@Roles`, `@PlatformOnly`, `@AccountAccess`, `@BillingAccess`, `@Feature`. Tenancy: `Organization → Campus → data`; active campus from `x-campus-id` validated against the user's roles; subscription and quota checks in `src/saas/policy.ts`. Data scoping by role in `src/auth/scope.ts`. Money-critical writes use `Db.serial()` (`src/db.ts`).

**Rules for every task**

1. Read the named files first; no rewrites outside the task.
2. Do not weaken: `AccessGuard` checks, `Scope.studentFilter` usage on every student-related query, organisation membership check, subscription/quota/feature gates, payment idempotency and gateway validation, maker-checker on waivers, closed-session read-only rule, document encryption.
3. Every new route: decide and declare its roles; scope every query by `ctx.campusId`/`ctx.orgId`; add a negative cross-tenant test in `backend/test`.
4. Schema changes are Prisma migrations safe on populated tables (add nullable/default, backfill, then constrain). Never edit applied migrations.
5. After each task run and report: `npm --prefix backend run typecheck`, `npm --prefix backend test`, `npm --prefix backend run test:integration` (when a database is available), `npm --prefix frontend run typecheck`. Never claim a test passed without running it.
6. Money is integer paisa; dates are calendar dates in Asia/Dhaka (`today()` in `src/common.ts`).
7. This system stores minors' data: never log personal data; never add public endpoints that expose student information without a second factor and rate limiting.
8. No unrelated refactors, upgrades or formatting churn.

---

## Stage 1 — Critical security and data integrity

1.1 **Repository hygiene.** Replace the root `.gitignore` (attacker remnant). Scan for `init` files, `eval(`, `atob(`, very long source lines; report.

1.2 **CI.** Move `backend/automation/workflows/ci.yml` to `.github/workflows/ci.yml` with Postgres and Redis services; run unit, integration and Playwright; make `deploy.yml` depend on success.

1.3 **Proxy awareness and rate limits.** In `src/config.ts` add `TRUST_PROXY`; in `src/main.ts` call `app.getHttpAdapter().getInstance().set("trust proxy", …)` before the limiters. Use a Redis store for `express-rate-limit` (reuse the ioredis connection). Key the admissions limiter by IP **and** school slug/session; key the registration limiter by IP. Add tests using `X-Forwarded-For`.

1.4 **Sign-up controls.** `POST saas/register`: require a verified phone or email (one-time code via the notification interface; console adapter in development) before creating the trial; refuse a second trial for the same verified contact; `POST saas/organizations` must not start a new trial for an owner whose existing organisation has an unpaid/expired trial (require platform approval).

1.5 **Password reset.** One-time code flow for all users; responses must not reveal account existence; increments `tokenVersion`.

1.6 **Staff lifecycle.** In `src/modules/users.ts` add `PATCH users/:id` (active flag, role changes within the campus, never granting SUPER_ADMIN except by a SUPER_ADMIN), `POST users/:id/reset-password`, and "attach existing user": if the email/phone already exists, add `OrganizationMember` + `UserCampusRole` after confirmation instead of failing. Quota applies. All audited inside the transaction.

1.7 **Token separation.** Sign upload/download tokens with a dedicated secret (`DOCUMENT_TOKEN_SECRET`) or a distinct audience verified explicitly; in production fail startup when `DOCUMENT_ENCRYPTION_KEY` is absent (remove the fallback in `src/modules/uploads.ts:33`).

1.8 **Online fees off by default.** Remove placeholder `cus_email`/`cus_phone` (`src/modules/payments.ts:91,95`) — use the paying guardian's data; add a startup warning and a platform setting that must be explicitly enabled before `sslcommerz` mode is accepted; document that settlement is platform-level until Stage 7.6.

1.9 **Audit in transactions.** Give `Audit.log` an optional transaction client and use it inside `serial` blocks in `users.ts`, `students.ts`, `fees.ts`, `attendance.ts`.

1.10 **Headers and MFA.** Add `headers()` in `frontend/next.config.ts` (CSP allowing the socket path and tenant media, HSTS, frame-ancestors, nosniff, referrer policy). Add TOTP MFA for `platformAdmin` users and SUPER_ADMIN (enrol, verify at login, recovery codes).

Stage 1 acceptance: ERP-020, 021, 024, 025, 027, 030, 110 in `product-audit/school-college-erp/test-cases.md` pass; CI green.

## Stage 2 — Broken functional workflows

2.1 **Jobs.** Split `maintenance()` (`src/jobs.ts:179-307`) into named repeatable jobs: `notices` (1 min; query uses an index on `(status, scheduledAt)`), `fines` (daily at 01:00 Dhaka; one set-based `UPDATE` per organisation), `monthly-billing` (daily check; generate only for structures without a marker for the current month — add `FeeStructure.lastGeneratedMonth` or a `BillingRun` table), `fee-reminders` (daily), `offer-expiry` (every 10 min). Skip organisations that are suspended or past grace.
2.2 **Worker process.** New entry `src/worker.ts` that boots only `Db`, `Jobs` processors and `Billing`; API process enqueues but does not process. Add a `worker` service to `deploy/docker-compose.prod.yml`.
2.3 **Billing rules.** In `src/modules/billing.ts`: generate `ONCE` heads for any active enrolment that has never been invoiced for that head (track by enrolment + head); replace the `/tuition/i` test with `FeeHead.siblingDiscountEligible Boolean`.
2.4 **Timetable.** Add `TimetableSlot.sessionId`; uniques `(sessionId, sectionId, dayOfWeek, period)` and `(sessionId, teacherId, dayOfWeek, period)`; backfill from `section.sessionId`; add `DELETE timetable/:id`; "copy from previous session" endpoint.
2.5 **Fee corrections.** `POST payments/:id/void` (FINANCE; second approver must differ; reason required): reverses allocations, restores invoice `paidMinor`/status, marks payment `VOIDED`, audited; receipt shows VOID. `POST fees/invoices` for ad-hoc invoices (student, lines, due date).
2.6 **Documents.** `src/modules/documents.ts`: institution name, logo and address from settings; embed a Bangla-capable Unicode font file shipped in the repo (check its licence); human-readable receipt numbers per campus and year; signature lines. Apply the same to the report card.
2.7 **Students.** `PATCH students/:id`; extended profile fields (father, mother, addresses, birth registration no., religion, photo reference — all optional); `POST students/import` accepting parsed rows (max 500 per request) returning per-row results; roll number uniqueness per section and session.

## Stage 3 — Database and architecture

3.1 **Settings.** `OrganizationSettings` (or `CampusSettings`): `lateFineMode` (NONE/PER_DAY/FLAT), `lateFinePerDayMinor`, `lateFineCapMinor`, `invoiceDueDay`, `siblingDiscountBps`, `feeRemindersEnabled`, `reminderDaysBefore`, `admissionOfferHours`, `waiverPrincipalThresholdMinor`, receipt/report header fields. Replace the corresponding `process.env` reads in `jobs.ts`, `billing.ts`, `fees.ts`; keep env values only as defaults for new organisations. Settings page under Settings (SUPER_ADMIN, CAMPUS_ADMIN).
3.2 Move every remaining `process.env` read in feature code into `src/config.ts`.
3.3 Index migration from `product-audit/school-college-erp/database-audit.md` §4; CHECK constraints for non-negative money and `paidMinor + waivedMinor <= totalMinor + fineMinor`.
3.4 Files to object storage: `AdmissionDocument` and `WebsiteAsset` keep metadata + storage key; encrypt before upload (keep AES-GCM); streaming download; migration script for existing rows.
3.5 Pagination (`page`, `limit`) for payments, leaves, users, SMS log, platform organisations and payments.
3.6 Read `lifecycle.ts`, `library.ts`, `transport.ts`, `homework.ts`, `support.ts`, `notices.ts`, `websites/*` for campus/organisation scoping; add an isolation test matrix covering every route with a foreign ID (expect 404/403).

## Stage 4 — Performance and reliability

4.1 Cache the guard's user/roles/membership/subscription lookup in Redis for 60 s; invalidate on role change, membership change, subscription change, logout/password change.
4.2 Frontend refresh: emit `campus-refresh:<event>` in `components/shell.tsx`; `useData(path, {events: [...]})` refetches only on matching events.
4.3 Socket.IO Redis adapter; confirm two API instances work behind the proxy.
4.4 Bulk PDFs (class report cards) as jobs producing a downloadable archive.
4.5 Cache `public-websites/resolve` in `src/proxy.ts` for 60 s.
4.6 Deploy: add pre-migration backup and health-gated rollback; structured logs with request ID; error tracker behind env.

## Stage 5 — UI/UX

Follow the prompt at the end of `product-audit/school-college-erp/ui-ux-audit.md`.

## Stage 6 — Missing commercial features

6.1 **Notification service + SMS adapter** for the contracted provider (keep `console`); per-organisation `SmsCreditLedger` (purchase, consume, refund); sending stops at zero balance with a visible warning; SMS log shows cost.
6.2 **Guardian access by phone**: guardian users identified by phone; OTP login; invitation SMS; one guardian linked to several students.
6.3 **Exam components**: `ExamComponent` per term+subject (name, max, pass); marks per component; pass/fail by rules; tabulation sheet and merit position endpoints; report card shows components.
6.4 **Setup assistant** endpoints (templates for classes/subjects; progress flags).
6.5 **Admission form configuration** per campus (fields on/off, required), optional application fee recorded as a manual payment.
6.6 **Certificates and ID cards** (PDF templates using settings branding).
6.7 **Bangla locale** dictionaries for portal, public forms, workspace.

## Stage 7 — Monetization and subscription

7.1 Reminders at T-14/T-7/T-1 (in-app + SMS/email to owners).
7.2 Grace period (configurable, default 14 days): `subscriptionUsable` returns usable-with-warning; after grace, staff read-only, guardian portal readable, exports allowed.
7.3 Invoice PDF before payment (plan, period, amount, payment instructions); sequential numbering.
7.4 Proration on upgrade; downgrade scheduled for period end with quota check; cancellation flag; refund as negative payment (platform admin, reason).
7.5 Student-band plans: add `includedStudents` and `perExtraStudentMinor` or new plan rows; migration path for existing subscriptions; platform plan editor updated.
7.6 **Per-organisation fee collection design** (do not enable until reviewed): either `OrganizationPaymentConfig` with encrypted school-owned gateway credentials, or a `SettlementLedger` with payout records if the platform collects. Write the design note first; implement only after owner approval.
7.7 Hosted checkout for subscription payments behind a feature flag once a merchant account exists; server-side validation and idempotent activation (reuse `PaymentService` patterns).
7.8 Platform console: expiring-soon queue, revenue by month, SMS revenue, tenant search and pagination.

## Stage 8 — Production infrastructure

8.1 Managed PostgreSQL with PITR dedicated to this product; nightly logical dump; restore drill script that runs the integration suite against the restored copy.
8.2 Dedicated Redis/Valkey; worker container; real domain with wildcard DNS/TLS for tenant sites; school website module disabled by default via platform setting.
8.3 Staging environment using the demo seed; production uses only `setup/bootstrap.ts`.
8.4 Monitoring and alerts: 5xx/503 rate, job failures and backlog, SMS failures, disk, memory, certificate expiry.
8.5 Slim runtime image (no dev dependencies); separate tools image for bootstrap.
8.6 Runbooks in `deploy/`: restore, rollback, Redis loss, SMS provider outage, payment reconciliation, tenant suspension, result-day checklist, data-incident procedure.

## Stage 9 — Final QA and regression

9.1 CI green: unit, integration, isolation matrix, Playwright (desktop + mobile + accessibility).
9.2 Run the school scenarios in `product-audit/testing/load-testing-plan.md` on staging with 10,000 students: attendance burst, result day, month-start billing; record latency percentiles, 503 count, pool utilisation.
9.3 One-term pilot with at least one school; log every manual intervention.
9.4 Re-run every row of `product-audit/school-college-erp/test-cases.md`; update statuses.
9.5 Readiness note: passed / failed / not run.

## Global acceptance criteria

- A school can sign up (verified), import students, add staff by invitation, configure its own fee and fine policy, take attendance, collect and void fees with branded receipts, publish results with Bangla-capable report cards, and renew its subscription with reminders and grace — without operator intervention.
- No route returns another organisation's or another family's data (isolation matrix).
- Month start and attendance peaks produce no 503s on staging at 10,000 students.
- SMS usage is metered per school.
- Backups restore; deploys roll back on failure.
