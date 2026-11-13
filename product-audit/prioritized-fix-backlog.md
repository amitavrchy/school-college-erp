# School & College ERP — Prioritized Fix Backlog

IDs match the audit files. Effort: S ≤ 3 days, M ≤ 2 weeks, L > 2 weeks.

## P0 — launch blockers

| # | ID | Item | Files | Effort | Verify |
|---|---|---|---|---|---|
| 1 | SEC-INC | Close the repository compromise; remove root `.gitignore` remnant; protect `main`; rotate secrets incl. `JWT_ACCESS_SECRET`, `DOCUMENT_ENCRYPTION_KEY` handling plan | repo settings, host `.env` | S | Written record |
| 2 | R-C1 | Activate CI (Postgres + Redis services, unit + integration + Playwright); gate deploy | `backend/automation/workflows/ci.yml` → `.github/workflows/`, `deploy.yml` | S | Failing test blocks deploy |
| 3 | R-S1 | `trust proxy` from env; Redis store for `express-rate-limit`; tenant-aware keys for public endpoints | `backend/src/main.ts`, `auth/rate-limit.ts`, `config.ts` | S | ERP-020, ERP-021 |
| 4 | R-B1 | Split maintenance into scheduled jobs; monthly billing once per structure; fines daily and set-based; worker container; skip suspended/expired tenants | `backend/src/jobs.ts`, `modules/billing.ts`, new `worker.ts`, `deploy/docker-compose.prod.yml` | M | ERP-080, ERP-081 |
| 5 | R-S3 | Organisation/campus settings replacing env policy | schema, `jobs.ts`, `billing.ts`, `fees.ts`, settings page | M | ERP-072 |
| 6 | R-B11 | Student import, edit, extended profile | `modules/students.ts`, students pages | M | ERP-040, ERP-041 |
| 7 | R-B12 / R-T4 | Staff deactivate/role change/reset; attach existing user | `modules/users.ts`, settings/staff page | M | ERP-025, ERP-027 |
| 8 | R-S5 / R-S10 | Sign-up verification, trial limit, password reset | `saas/controllers.ts`, `saas/service.ts`, `auth/auth.controller.ts` | M | ERP-024, ERP-030 |
| 9 | R-B4 | Payment void/reversal with second approver; ad-hoc invoices | `modules/payment.service.ts`, `payments.ts`, `fees.ts`, schema | M | ERP-073 |
| 10 | R-B2 | One-time heads per enrolment; discount flag on fee head | `modules/billing.ts`, schema | S | ERP-070, ERP-071 |
| 11 | R-B3 | Institution-branded PDFs, Bangla font, readable numbers | `modules/documents.ts`, `saas/controllers.ts` | M | ERP-063, ERP-075 |
| 12 | R-B5 | Timetable per session + delete | schema, `modules/academics.ts` | S | ERP-090 |
| 13 | R-B8 | Subscription reminders, grace, pre-payment invoice | `saas/policy.ts`, `saas/service.ts`, job | S–M | ERP-033, ERP-034 |
| 14 | R-R1 | Managed Postgres + PITR, restore drill, monitoring | infra | M | Restore succeeds |
| 15 | R-S2 | Keep `PAYMENT_MODE=manual`; hide online pay; remove placeholder contact data | `modules/payments.ts`, deploy docs | S | Config check |

## P1 — high priority

| ID | Item | Files | Effort |
|---|---|---|---|
| R-S4 / R-B16 | Bangladeshi SMS provider adapter; per-organisation credit ledger and purchase | `jobs.ts`, schema, notices/subscription pages | M |
| I18N | Bangla locale (guardian portal, `/apply`, `/start`, then workspace) | frontend | M |
| R-S7 | CSP/HSTS and other headers | `frontend/next.config.ts` | S |
| R-S10 | MFA (TOTP) for platform admin and SUPER_ADMIN | `auth/*` | S–M |
| R-S6 | Separate secret/audience for purpose tokens; require `DOCUMENT_ENCRYPTION_KEY` in production | `modules/uploads.ts`, `admissions.ts`, `config.ts` | S |
| R-S9 | Audit writes inside transactions | `audit.ts`, modules | S |
| R-F1 | Event-scoped refresh | `frontend/src/components/shell.tsx`, `lib/use-data.ts` | S |
| R-B6 | Pagination for payments, leaves, users, platform lists | controllers + pages | S–M |
| R-D1 / R-S8 | Documents and media to object storage | `modules/uploads.ts`, `websites/*` | M |
| DB | Index migration (`database-audit.md` §4); CHECK constraints | `backend/prisma` | S |
| REVIEW | Read + isolation tests for lifecycle, library, transport, homework, support, websites | `backend/test` | M |
| SETUP | Setup assistant and templates | frontend + small backend | M |
| R-B13 | Exam components, tabulation, merit position | `modules/exams.ts`, schema, pages | M |
| R-B7 | Configurable admission form | `modules/admissions.ts`, `/apply` | M |
| GUARD | Cache guard context 30–60 s | `auth/access.ts` | S |

## P2 — medium

| ID | Item | Effort |
|---|---|---|
| R-C2 / R-C3 | Move remaining `process.env` reads into `config`; constants into settings | S |
| R-C6 / R-C7 | Split maintenance function; shared cookie helper | S |
| R-C8 | Split website editor | M |
| R-B17 | Session templates for colleges | S |
| R-C11 | Slim runtime image; separate tools image for bootstrap | S |
| R-C10 | Remove demo slug default | S |
| PRICING | Student-band plans and migration | S–M |
| CERT | Certificates and ID cards | M |
| GUARDIAN | Phone + OTP access | M |
| EXPORT | Organisation data export | S |
| OPS | Platform reporting, support access with audit | M |
| CAPTCHA | Public form protection | S |

## P3 — later

Per-school online fee settlement; payroll; mobile app; website CMS as paid add-on; white-label; hostel; biometric integration.

## Dependencies

- 2 before everything else.
- 5 before 9–11 (settings carry policy and branding).
- Notification delivery (SMS/email adapter) before 8 and 13 reminders — build a minimal adapter early.
- 14 before any pilot school's real data is loaded.
