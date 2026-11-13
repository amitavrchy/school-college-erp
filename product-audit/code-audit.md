# School & College ERP — Code Quality Audit

Commit `2e11d6a`. 100 commits between 2026-11-03 and 2026-11-13.

## 1. Size and shape

| Area | Files | Lines | Notes |
|---|---:|---:|---|
| `backend/src` | 44 | ≈ 6,000 | Largest: `websites/service.ts` 374, `saas/controllers.ts` 359, `jobs.ts` 308, `modules/lifecycle.ts` 305 |
| `backend/test` | 7 | ≈ 1,700 | `integration.test.ts` 581, `websites.test.ts` 481, `saas.test.ts` 424; plus unit files |
| `backend/prisma` | schema 694, seeds 561, migrations ≈ 1,090 | | |
| `frontend/src` | 51 | ≈ 9,700 TS/TSX + ≈ 5,000 CSS | `website/page.tsx` 1,398 |

## 2. Executed checks

On an exported copy, Node v20.18.0 (project requires ≥ 22; warnings only):

| Check | Result |
|---|---|
| `npm ci --ignore-scripts` (both apps) | PASS |
| `npm audit` (both apps) | 0 vulnerabilities |
| `prisma generate` | PASS (6.19.3) |
| Backend `tsc --noEmit` | PASS |
| Frontend `tsc --noEmit` | PASS |
| `tsx --test test/domain.test.ts test/security.test.ts test/websites-unit.test.ts` | PASS 9/9 |
| Integration and browser suites | BLOCKED / NOT RUN (need PostgreSQL, Redis, browsers) |

## 3. Findings

| ID | Class | Finding | Evidence |
|---|---|---|---|
| R-C1 | CONFIRMED BUG | CI workflow is stored at `backend/automation/workflows/ci.yml` and never runs | repo tree |
| R-C2 | CONFIRMED ARCHITECTURAL WEAKNESS | Business configuration read directly from `process.env` in feature code instead of the validated `config` object | `payments.ts:43-46`, `:81-82`, `:112`; `jobs.ts:113`, `:220`, `:247`; `billing.ts:33`; `uploads.ts:28-33` |
| R-C3 | CONFIRMED ARCHITECTURAL WEAKNESS | Hard-coded policy constants in code paths (waiver threshold, fine cap, due day, offer hours, 14-day trial, 30-minute absence delay) | `fees.ts:127`, `jobs.ts:221`, `:244`, `:298`, `:90`; `saas/service.ts:61` |
| R-C4 | Low | A controller is registered as a provider so another controller can call it | `app.module.ts:84`, `documents.ts:18` |
| R-C5 | Low | Dynamic `import("@nestjs/common")` inside a transaction to throw a `ConflictException` | `students.ts:93` |
| R-C6 | Medium | `maintenance()` mixes five unrelated duties (notice dispatch, fines, monthly billing, reminders, offer expiry) in one 130-line function run every minute | `jobs.ts:179-307` |
| R-C7 | Medium | Session cookie options are duplicated in two controllers | `auth.controller.ts:44-52`, `saas/controllers.ts:61-69` |
| R-C8 | Medium | 1,398-line client page for the website editor | `frontend/src/app/(workspace)/website/page.tsx` |
| R-C9 | Low | Untyped API responses on the client (`api<T = any>`) | `frontend/src/lib/api.ts:10` |
| R-C10 | Low | Demo defaults leak into product code: the public admissions endpoint defaults the school slug to `"scholars"` | `admissions.ts:39` |
| R-C11 | Low | Runtime image ships dev dependencies and TypeScript sources so seeds and bootstrap can run with `tsx` | `backend/Dockerfile` |

## 4. Strengths

- Validated environment at startup; readiness endpoint covering database and Redis.
- Authorization concentrated in one guard and one scope service; decorators make intent visible at each route.
- Pure domain functions with unit tests (`domain/grading.ts`, `domain/fees.ts`, `domain/workflow.ts`).
- Idempotency designed in (payments, invoices, SMS, grants).
- Prettier configuration and a `typecheck` script covering tooling files.
- Operational documents in `backend/docs/` (OPERATIONS, RELEASE-QA, IMPLEMENTATION, SCHOOL-WEBSITES).

## 5. Technical debt register

| Debt | Cost if left | Effort |
|---|---|---|
| Environment-level tenant policy | Every school gets the same fines, discounts and reminders | M |
| Every-minute monolithic maintenance | Load grows with tenants; month-start storm | S–M |
| In-process worker | Jobs die with API restarts; no independent scaling | S |
| No staff/student lifecycle endpoints | Manual database edits for common requests | M |
| Files in database | Backup size and restore time | M |
| Large CMS editor | Slows all frontend work in that area | M |
| Inactive CI | Regressions reach production | S |
| Unverified optional modules (library, transport, homework, lifecycle) | Unknown defects | Review + tests |

## 6. Scope caution

The repository includes a school-website CMS with custom domains, revisions, feeds and sitemaps (≈ 1,300 backend lines and ≈ 3,000 frontend lines). It is well beyond a first ERP launch and multiplies the public attack surface (host routing, tenant-authored content, TLS authorisation endpoint). Recommendation: keep it switched off for early customers, or offer it as a later paid module after a focused security review.
