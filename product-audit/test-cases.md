# School & College ERP — Test Cases

Status: PASS / FAIL / BLOCKED / NOT RUN / NOT APPLICABLE. "(static)" = derived from source. Executed rows ran on an exported copy of `2e11d6a`, Node v20.18.0, no database.

| ID | Module | Scenario | Preconditions | Steps | Expected | Actual | Status | Sev | Evidence | Fix |
|---|---|---|---|---|---|---|---|---|---|---|
| ERP-001 | Build | Backend type-check | deps, Prisma client | `npx tsc --noEmit` | exit 0 | exit 0 | PASS | — | run log | — |
| ERP-002 | Build | Frontend type-check | deps | `npx tsc --noEmit` | exit 0 | exit 0 | PASS | — | run log | — |
| ERP-003 | Deps | Vulnerabilities | lockfiles | `npm audit` ×2 | 0 | 0 | PASS | — | run log | — |
| ERP-004 | Domain | FIFO fee allocation never overpays; late fines on Bangladesh calendar with cap; NCTB grade boundaries; workflow transitions; Bangla SMS segment counting | — | `tsx --test test/domain.test.ts` | pass | 5/5 | PASS | — | run log | — |
| ERP-005 | Security unit | Authenticated users behind one proxy get separate rate-limit buckets and forged cookies cannot create buckets; subscription expiry and month-end renewal boundaries | — | `tsx --test test/security.test.ts` | pass | 2/2 | PASS | — | run log | — |
| ERP-006 | Websites unit | CMS rejects executable URLs, duplicate paths and unconsented roll-only result publication; domain claims need TXT proof | — | `tsx --test test/websites-unit.test.ts` | pass | 2/2 | PASS | — | run log | — |
| ERP-007 | CI | Tests on push | — | inspect workflows | active CI | file under `backend/automation/` | FAIL (static) | High | repo tree | Move to `.github/workflows` |
| ERP-010 | Tenancy | Cross-organisation access, payment races, seat capacity, approvals | Postgres+Redis | `test/integration.test.ts` | pass | — | BLOCKED | Crit | test exists | CI |
| ERP-011 | SaaS | Onboarding, quotas, payment review, grants | Postgres+Redis | `test/saas.test.ts` | pass | — | BLOCKED | Crit | test exists | CI |
| ERP-012 | Websites | Publishing, domains, results | Postgres+Redis | `test/websites.test.ts` | pass | — | BLOCKED | High | test exists | CI |
| ERP-020 | Rate limit | Per-client admission limit | proxy in front | 21 applications/min from IP A, then 1 from IP B | B accepted | B gets 429 | FAIL (static) | High | `main.ts:62-65`, no `trust proxy` | Trust proxy + keying |
| ERP-021 | Rate limit | Per-client sign-up limit | proxy | 11 sign-ups/hour platform-wide | independent per IP | 11th rejected for everyone | FAIL (static) | High | `main.ts:25-28` | Same |
| ERP-022 | Auth | Login unknown email timing | — | compare timings | similar | dummy hash compared | NOT RUN | Low | `auth.controller.ts:38-41` | — |
| ERP-023 | Auth | Token after logout | session | logout, replay cookie | 401 | 401 (tokenVersion) | NOT RUN | High | `access.ts:76-77` | — |
| ERP-024 | Auth | Forgot password | — | request reset | flow | absent | FAIL (static) | High | routes | Implement |
| ERP-025 | Auth | Deactivate departed teacher | admin | PATCH user | inactive | no route | FAIL (static) | High | `users.ts` | Add lifecycle routes |
| ERP-026 | Auth | Add guardian without email | admin | POST users | created with phone | email required | FAIL (static) | High | `users.ts:33-42` | Phone-based accounts |
| ERP-027 | Auth | Add staff who already has an account elsewhere | user exists | POST users same email | role attached | 409 | FAIL (static) | Med | `users.ts:45-56` | Invite existing |
| ERP-030 | SaaS | Trial farming | account | POST saas/organizations ×5 | limited | 5 trials | FAIL (static) | Med | `saas/controllers.ts:72-77` | Verification + limit |
| ERP-031 | SaaS | Reused wallet reference | approved payment | submit same reference | rejected | rejected (unique) | NOT RUN | High | schema | — |
| ERP-032 | SaaS | Approve with wrong amount | pending | review with different amount | 400 | 400 | NOT RUN | High | `saas/service.ts:209-210` | — |
| ERP-033 | SaaS | Expiry grace | expired yesterday | POST attendance | allowed during grace | 402 | FAIL (static) | Med | `saas/policy.ts:76-80` | Grace period |
| ERP-034 | SaaS | Renewal reminder | 7 days to expiry | wait | notice/SMS | none | FAIL (static) | Med | `jobs.ts` | Reminder job |
| ERP-040 | Students | Bulk import 300 students | CSV | upload | imported with row report | no feature | FAIL (static) | High | routes | Import |
| ERP-041 | Students | Edit student name | student | PATCH | updated | no route | FAIL (static) | High | `students.ts` | Add PATCH |
| ERP-042 | Students | Section capacity | full section | POST student | 409 | 409 | NOT RUN | Med | `students.ts:91-93` | — |
| ERP-043 | Students | Guardian views another family's child | guardian | GET students/:id | 404 | 404 by scope | NOT RUN | Crit | `scope.ts:25-36` | — |
| ERP-050 | Attendance | Future date | teacher | POST bulk tomorrow | 400 | 400 | NOT RUN | Low | `attendance.ts:69-70` | — |
| ERP-051 | Attendance | Student outside section | teacher | POST bulk | 400 | 400 | NOT RUN | High | `:73-81` | — |
| ERP-052 | Attendance | Absence SMS skipped on approved leave | leave approved | mark absent | no SMS | skipped | NOT RUN | Med | `jobs.ts:157-167` | — |
| ERP-060 | Exams | Marks by unassigned teacher | teacher | POST marks | 403 | 403 | NOT RUN | High | `exams.ts:123-127` | — |
| ERP-061 | Exams | Publish incomplete term | missing marks | POST publish | 400 | 400 | NOT RUN | High | `exams.ts:189-199` | — |
| ERP-062 | Exams | Written + MCQ + practical components | — | enter components | supported | single mark | FAIL (static) | Med | `exams.ts:109-116` | Components |
| ERP-063 | Documents | Bangla name on report card | Bangla name | download PDF | readable | default font | FAIL (static) | Med | `documents.ts:20-59` | Embed Bangla font |
| ERP-070 | Fees | Mid-year admission gets one-time fee | join in month 5 | generate | includes ONCE head | excluded | FAIL (static) | High | `billing.ts:13-20` | Per-enrolment logic |
| ERP-071 | Fees | Sibling discount on a Bangla-named head | discount set | generate | applied | not applied | FAIL (static) | Med | `billing.ts:53` | Flag on fee head |
| ERP-072 | Fees | School disables late fines | — | settings | no fines | global env only | FAIL (static) | High | `jobs.ts:217-221` | Per-org settings |
| ERP-073 | Fees | Void a mistaken manual payment | payment | void | reversed with audit | no route | FAIL (static) | High | routes | Reversal |
| ERP-074 | Fees | Duplicate payment submit | — | same key twice | one payment | one | NOT RUN | Crit | `payment.service.ts:13-22` | — |
| ERP-075 | Fees | Receipt shows school name | payment | download | institution header | "Campus One" | FAIL (static) | Med | `documents.ts:72` | Branding |
| ERP-076 | Fees | Online payment goes to the school's account | sslcommerz mode | pay | school merchant | platform merchant | FAIL (static) | High | `payments.ts:80-100` | Per-org config |
| ERP-080 | Jobs | Month-start billing runs once | 1st of month | observe | one run per structure | every minute | FAIL (static) | High | `jobs.ts:235-246` | Daily guard |
| ERP-081 | Jobs | Fine calculation load | 100k due invoices | run | bounded | full scan each minute | NOT RUN | High | `jobs.ts:213-233` | Daily, indexed |
| ERP-090 | Timetable | New session reuses teacher slot | old session slot exists | POST timetable | created | unique violation | FAIL (static) | High | schema `TimetableSlot` | Session scope |
| ERP-100 | Uploads | Wrong file type | token | upload exe as pdf | 400 | 400 | NOT RUN | High | `uploads.ts:72-78` | — |
| ERP-101 | Uploads | Expired download link | 6 min old | GET download | 401 | 401 | NOT RUN | High | `uploads.ts:35-42` | — |
| ERP-110 | Headers | CSP present | — | `curl -I` frontend | CSP header | none configured | FAIL (static) | Med | `next.config.ts` | Add headers |
| ERP-120 | E2E | Institution sign-up to receipt | stack | `e2e/saas.spec.ts` | pass | — | NOT RUN | Crit | spec exists | CI |
| ERP-121 | E2E | Accessibility scan | stack | `e2e/accessibility.spec.ts` | no violations | — | NOT RUN | Med | spec exists | CI |
| ERP-130 | Load | Morning attendance burst + result day | staging | k6 plan | p95 < 600 ms | — | NOT RUN | High | plan | Execute |
