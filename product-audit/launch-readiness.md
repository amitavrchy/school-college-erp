# School & College ERP — Launch Readiness

## Scoring method

Judgement scores anchored to cited evidence (bands: 0–20 absent, 21–40 major gaps, 41–60 workable with significant defects, 61–80 solid with known gaps, 81–100 production grade). NOT ASSESSED where no runtime evidence exists. Several modules were mapped but not read (lifecycle, library, transport, homework, support, websites); scores assume they are no better or worse than the code that was read, which is an assumption.

## Scores

| Category | Score | Evidence |
|---|---:|---|
| Code Quality | 66 | Type-checks and 9 unit tests pass (executed); validated config; pure domain modules; env-level policy constants, monolithic maintenance job, 1,400-line editor page, inactive CI (`code-audit.md`) |
| Backend Architecture | 66 | Central guard, scope service, serializable helper with pool-aware errors, idempotent payments; in-process worker, job design, global tenant policy (`backend-audit.md`) |
| Frontend Architecture | 55 | Cookie session, role navigation, feature gates, host-routed tenant sites, a11y tests; global refresh, oversized components, no headers (`frontend-audit.md`) |
| Database Design | 64 | Broad relational integrity and composite uniques; timetable uniqueness bug, files in DB, job-unfriendly indexes (`database-audit.md`) |
| Security | 58 | Strong authorization, revocation, gateway validation, encrypted documents, clean audit; `trust proxy` gap, unverified sign-up, no MFA/reset, no CSP, unresolved repo compromise (`security-audit.md`) |
| Functional Completeness | 60 | Admissions, attendance, exams, fees, portals, SaaS billing present; no import/edit for students, no staff lifecycle, no fee corrections, thin exams and documents (`feature-inventory.md`) |
| UI/UX | 55 (static only) | Complete surface with onboarding and landing; English only; heavy manual entry (`ui-ux-audit.md`). Rendering NOT VERIFIED |
| Performance | NOT ASSESSED | No load test. Static risks: every-minute scans, month-start storm, global refetch (`performance-scalability.md`) |
| Scalability | 45 | Explicit pool, 503 handling, queue with retries; per-process limits/sockets, worker in API |
| Reliability | 35 | Readiness probe, migrate-before-start, bootstrap without demo data; no backups, monitoring or CI gate; shared host |
| Testing Maturity | 55 | Unit, integration (tenancy, payments, SaaS, websites) and Playwright incl. accessibility exist; only unit tests could be run; nothing runs automatically |
| Monetization Readiness | 55 | Plans, trial, quotas, manual payments, receipts, suspension work in code; no reminders, grace, invoices, SMS metering |
| Production Readiness | 35 | Deployable stack with required Redis; shared infrastructure, IP-based hostname, open incident |

## Classification

**READY FOR INTERNAL TESTING.** Closest of the three to **READY FOR CONTROLLED BETA**: that level is reachable once the P0 list below is closed. Not ready for limited commercial launch.

## Blockers

1. Repository/CI compromise not fully closed; this product holds minors' data.
2. `trust proxy` missing — platform-wide throttling of sign-up and admission endpoints.
3. Background job design: month-start billing storm and every-minute full scans.
4. Tenant policy (fines, discounts, reminders, due day) is global configuration.
5. No student import/edit and no staff lifecycle — schools cannot finish onboarding or maintain data.
6. No fee corrections; receipts and report cards not institution-branded and not Bangla-capable.
7. No password reset; unverified sign-ups with unlimited trials.
8. No backups, monitoring or CI gate.
9. Timetable uniqueness defect across sessions.
10. Unreviewed modules (lifecycle, library, transport, homework, websites).

## Path to next levels

| Level | Requirements |
|---|---|
| Controlled beta (2–3 pilot schools, free) | Blockers 1, 2, 3, 8, 9 closed; student import; website CMS disabled; pilot schools' policies set manually; daily check-ins |
| Limited commercial launch (10–15 schools) | + blockers 4–7 closed; SMS provider with credits; Bangla guardian portal; subscription reminders and grace; restore drill; load test for attendance/result/billing scenarios; privacy notice |
| Broader rollout | + exam components and print quality; guardian phone access; hosted checkout; operator tooling; second instance readiness |

## Effort estimate

Roadmap 1 in `product-roadmap.md`: roughly 10–13 engineer-weeks, excluding school onboarding effort, SMS-provider contracting and legal text. Estimate only.
