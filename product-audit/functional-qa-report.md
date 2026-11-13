# School & College ERP — Functional QA Report

## 1. Executed versus not executed

Environment: exported copy of `2e11d6a`, macOS, Node v20.18.0 (project requires ≥ 22; warnings only), no Docker/PostgreSQL/Redis.

| Activity | Status | Evidence |
|---|---|---|
| `npm ci --ignore-scripts` backend, frontend | PASS | exit 0 |
| `npm audit` backend, frontend | PASS | 0 vulnerabilities |
| `prisma generate` | PASS | Prisma Client 6.19.3 |
| Backend `tsc --noEmit` | PASS | exit 0 |
| Frontend `tsc --noEmit` | PASS | exit 0 |
| Unit tests: `test/domain.test.ts` (5), `test/security.test.ts` (2), `test/websites-unit.test.ts` (2) | PASS | 9 passed, 0 failed |
| Integration tests: `integration.test.ts`, `saas.test.ts`, `websites.test.ts` | BLOCKED | Need PostgreSQL and Redis (`test/run-integration.mjs`) |
| Playwright: `accessibility`, `saas`, `website`, `workflows` specs | NOT RUN | Need running stack and browsers |
| Load tests | NOT RUN | — |

Journey verdicts below are static traces through source.

## 2. Journeys

### SaaS onboarding: register → organisation → plan → payment → activation → setup → daily use

| Step | Verdict | Evidence |
|---|---|---|
| Register institution + owner | Present; no verification | `saas/controllers.ts:48-71` |
| Organisation, main campus, calendar-year session, grade scale, 14-day trial | Created in one serializable transaction | `saas/service.ts:28-99` |
| Plan selection | At registration | same |
| Payment | Submit wallet/bank reference → platform admin approves with exact amount | `saas/controllers.ts:95-142`, `saas/service.ts:193-234` |
| Activation | Idempotent; extends from current period end if active | `saas/service.ts:144-192` |
| Receipt | PDF after approval | `saas/controllers.ts:143-173` |
| Initial setup (classes, sections, subjects, staff, students) | Manual, one record at a time | modules |

Result: **PASS (static)** — the only one of the three products where this journey exists. A Playwright spec covers it (`e2e/saas.spec.ts:83`), NOT RUN.

### Subscription lifecycle: trial → upgrade → payment → renewal → failed payment → grace → cancellation

Trial and paid activation exist. Renewal is a new manual payment. No reminder, grace period, failed-payment state, downgrade or cancellation. At period end all writes return 402 immediately (`saas/policy.ts:65-80`). Result: **PARTIAL**.

### Authentication: login → dashboard → password change → logout

Present, with session revocation on logout and password change. No password reset or verification. Result: **PARTIAL**.

### Admission: public application → documents → review → merit list → offer → acceptance → enrolment

Present end to end in routes (`admissions.ts`, `uploads.ts`, job for offer expiry and waitlist promotion). The application form is minimal. Result: PASS (static) for flow; data capture insufficient for real admissions.

### Daily academics: attendance → absence SMS → leave → marks → publish → guardian sees result → report card

Traced through `attendance.ts`, `jobs.ts`, `exams.ts`, `documents.ts`. SMS is simulated unless a provider is configured. Report card is an English text PDF. Result: **PASS (static)** with presentation gaps.

### Fees: structure → generate invoices → guardian sees dues → payment → receipt → fee report

Manual payments by accounts staff work with FIFO allocation and receipts. Automatic generation and fines are driven by global settings. Online payment is off by default and platform-wide when on. Result: **PASS (static)** for manual collection; **FAIL** for per-school policy and corrections (no void).

### Roles: owner → admin → principal → accounts → teacher → guardian → student

Guard and `Scope` enforce role and relationship access; a Playwright test asserts guardian restrictions. Result: PASS (static). Integration tests exist (BLOCKED).

### Second academic year

Promotion and session activation exist (not read in full). Timetable creation for the new session will conflict with the previous session's slots for the same teacher (R-B5). Result: **FAIL (static)** for timetable.

### Staff turnover

A teacher who leaves cannot be deactivated through the product (`users.ts` has no update). Result: **FAIL (static)**.

## 3. Edge cases (static)

| Case | Code behaviour | Verdict |
|---|---|---|
| Double submit of a fee payment | Same idempotency key returns the first payment | PASS |
| Two cashiers collect for the same student simultaneously | Student row lock; second may get "Balance changed" | PASS |
| Payment larger than dues | Rejected | PASS (no advance payments) |
| Gateway callback forged | Validated with gateway; amount/currency/transaction checked | PASS |
| Mark attendance for tomorrow | Rejected | PASS |
| Teacher enters marks for another teacher's subject | 403 | PASS |
| Publish with missing marks | Rejected | PASS |
| Section full | 409 | PASS |
| Student quota exceeded | 402 with upgrade message | PASS |
| Subscription expired | Writes 402; reads allowed | PASS; no grace |
| 21st admission application in a minute, any school | 429 for everyone (shared bucket) | FAIL (R-S1) |
| 11th institution sign-up in an hour, platform-wide | 429 | FAIL (R-S1) |
| Guardian without email | Cannot be created | FAIL |
| Student name in Bangla on report card | Not rendered by default PDF font | FAIL (static) |
| Month start with many tenants | Billing regenerated every minute all day | FAIL (R-B1) |
| Upload a renamed executable as PDF | Rejected by magic-byte check | PASS |

## 4. Before launch

1. Activate CI (Postgres + Redis) and run the three integration suites and four Playwright specs on every change.
2. Read and test the unverified modules (lifecycle, library, transport, homework, support, websites) with tenant-isolation cases.
3. Pilot with one small school for a full month covering admission, attendance, one exam term and one fee cycle.
4. Run the school workload in `../testing/load-testing-plan.md` on staging.
