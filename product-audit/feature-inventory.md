# School & College ERP — Feature Inventory

Status: COMPLETE, PARTIALLY IMPLEMENTED, BROKEN, FRONTEND ONLY, BACKEND ONLY, NOT IMPLEMENTED, NOT VERIFIED. "COMPLETE" = code path present end to end; nothing was exercised in a running system here. Rows marked NOT VERIFIED are modules whose routes and decorators were mapped but whose logic was not read. Tests: U unit (executed, pass), I integration, E Playwright (exist; not runnable locally).

## Platform and SaaS

| Feature | Page | Endpoint | Status | Notes |
|---|---|---|---|---|
| Institution self-registration with trial | `/start` | `POST saas/register` | COMPLETE | No verification; unlimited trials (R-S5). E |
| Plans (Starter/Growth/Scale) | `/`, `/subscription` | `GET saas/plans` | COMPLETE | Prices editable by platform admin |
| Quotas (campuses, students, staff) | — | `saas/policy.ts` | COMPLETE | I |
| Feature entitlements | `module-gate.tsx` | `@Feature` | COMPLETE | library, transport, homework, support |
| Subscription payment request (bKash/Nagad/bank) | `/subscription` | `POST saas/payment-requests` | COMPLETE | Manual |
| Payment review, grant, receipt | `/platform`, `/subscription` | `platform/*`, `saas/payments/:id/receipt` | COMPLETE | E |
| Trial expiry / renewal reminders / grace | — | — | PARTIALLY IMPLEMENTED | Hard stop on writes at expiry; no reminders or grace (R-B8) |
| Upgrade / downgrade / cancel / refund | — | — | NOT IMPLEMENTED | Plan can be changed only through a new payment or grant |
| Automated gateway billing | — | — | NOT IMPLEMENTED | — |
| Organisation suspend/reactivate | `/platform` | `PATCH platform/organizations/:id` | COMPLETE | — |
| Platform settings, plan editing, platform audit | `/platform` | `platform/settings`, `plans/:id`, `audit` | COMPLETE | — |

## Institution management

| Feature | Endpoint | Status | Notes |
|---|---|---|---|
| Campus management | `campuses` | COMPLETE (not read in full) | Quota-checked |
| Academic sessions (plan, activate, close) | `sessions` | COMPLETE (not read in full) | Default session is calendar-year |
| Classes, sections (capacity), subjects | `classes`, `sections`, `subjects` | COMPLETE | Create/list; edit/delete NOT VERIFIED |
| Departments / groups (Science, Commerce, Arts) | — | NOT IMPLEMENTED | No model found |
| Teacher–subject assignment | `assignments` | COMPLETE | — |
| Timetable | `timetable` | BROKEN across sessions | R-B5; no delete |
| Holidays / academic calendar | `holidays` | COMPLETE | Calendar view NOT VERIFIED |

## Students

| Feature | Endpoint | Status | Notes |
|---|---|---|---|
| Student admission (manual add) | `POST students` | PARTIALLY IMPLEMENTED | One at a time; minimal fields; no edit (R-B11) |
| Bulk import | — | NOT IMPLEMENTED | — |
| Guardian linking | `POST students/:id/guardians` | COMPLETE | Guardian user must already exist |
| Student ID / roll | — | PARTIALLY IMPLEMENTED | Code entered by staff; roll = count + 1 |
| Promotion with hold list | `lifecycle/promote` | NOT VERIFIED | E/I exist |
| Transfer between campuses with prorated dues | `lifecycle/transfer` | NOT VERIFIED | — |
| Student history across sessions | `students/:id`, results | COMPLETE | — |
| Student documents | — | PARTIALLY IMPLEMENTED | Admission documents only |
| Online admission: application, documents, merit list, seat offer, waitlist | `/apply`, `admissions/*` | COMPLETE | Thin form (R-B7); I |

## Academics

| Feature | Endpoint | Status | Notes |
|---|---|---|---|
| Daily/period attendance | `attendance/bulk` | COMPLETE | I, E |
| Absence SMS to guardian | job `absence` | COMPLETE (simulated by default) | `SMS_PROVIDER=console` |
| Leave requests and approval | `leaves` | COMPLETE | Unpaginated |
| Exam terms, marks entry, moderation, publication | `exams/*` | COMPLETE | Single mark per subject (R-B13); U, I |
| Grading / GPA (NCTB-style scale seeded per campus) | `domain/grading.ts`, `GradeScale` | COMPLETE | U. Confirm scale with schools |
| Results for guardians/students | `exams/results/:studentId` | COMPLETE | Published terms only |
| Report card PDF | `students/:id/report-card` | PARTIALLY IMPLEMENTED | English only, plain layout (R-B3) |
| Homework and submissions | `homework/*` | NOT VERIFIED | Feature-gated |
| Notices (draft, schedule, audience, SMS) | `notices/*` | COMPLETE (partly read via job) | Optional Bangla body |
| Public result lookup on school website | `public-websites/*` | NOT VERIFIED | — |

## Finance

| Feature | Endpoint | Status | Notes |
|---|---|---|---|
| Fee structures per class with heads (monthly/quarterly/once) | `fees/structures` | COMPLETE | — |
| Invoice generation (manual + automatic on the 1st) | `fees/generate`, job | PARTIALLY IMPLEMENTED | R-B1, R-B2 |
| Sibling discount | `billing.ts` | PARTIALLY IMPLEMENTED | Global env; name-based |
| Scholarships / waivers with approval | `fees/waivers*` | COMPLETE | Maker-checker |
| Manual payment collection | `payments/intent` (MANUAL) | COMPLETE | No void/refund (R-B4) |
| Online payment (SSLCommerz) | `payments/intent`, callbacks | PARTIALLY IMPLEMENTED | Platform-wide merchant; placeholders (R-S2, R-B14) |
| Late fines | job | PARTIALLY IMPLEMENTED | Global policy (R-S3) |
| Due tracking, fee-collection report | `fees/invoices`, `reports/fee-collection` | COMPLETE | — |
| Payment receipt PDF | `payments/:id/receipt` | PARTIALLY IMPLEMENTED | Platform-branded |
| Payroll | — | NOT IMPLEMENTED | — |
| Expense / accounting | — | NOT IMPLEMENTED | — |

## Staff

| Feature | Status | Notes |
|---|---|---|
| Staff accounts and roles | PARTIALLY IMPLEMENTED | Create and list only (R-B12) |
| Staff attendance, leave, payroll, performance | NOT IMPLEMENTED | — |

## Portals and communication

| Feature | Status | Notes |
|---|---|---|
| Admin dashboard | COMPLETE | `reports/dashboard` |
| Teacher views (own sections) | COMPLETE | Via `Scope` |
| Guardian / student portal | COMPLETE | `/guardian`; accounts created by admin with email + password |
| SMS | PARTIALLY IMPLEMENTED | Generic HTTP adapter; simulated by default; unmetered |
| Email | NOT IMPLEMENTED | — |
| Realtime refresh | COMPLETE | Socket.IO |
| Support tickets | NOT VERIFIED | Feature-gated |

## Optional modules

| Module | Status | Notes |
|---|---|---|
| Library (books, loans, fines, reservations) | NOT VERIFIED | 240 lines; feature-gated |
| Transport (routes, stops, assignments, trips, billing) | NOT VERIFIED | 211 lines; feature-gated |
| Hostel | NOT IMPLEMENTED | — |
| Certificates (testimonial, TC) | NOT IMPLEMENTED | — |
| School website CMS with domains | NOT VERIFIED | Large; see `code-audit.md` §6 |
| LMS integration | NOT IMPLEMENTED | — |

## Cross-cutting

| Capability | Status |
|---|---|
| Bangla interface and documents | NOT IMPLEMENTED (notice body only) |
| Password reset, MFA | NOT IMPLEMENTED |
| Audit log | COMPLETE (`reports/audit`) |
| Data export | PARTIALLY IMPLEMENTED (CSV helpers in UI) |
| Per-school configuration of fee/admission policy | NOT IMPLEMENTED (global env) |
