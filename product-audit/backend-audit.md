# School & College ERP — Backend Engineering Audit

Static review of `backend/src` (≈ 6,000 lines) at commit `2e11d6a`. Modules read in detail: bootstrap, auth, SaaS, jobs, realtime, health, payments, payment service, billing, uploads, users, students, attendance, fees, exams (marks, publish, results), documents, admissions (public part). Modules mapped by routes and decorators only: academics (timetable read), lifecycle, library, transport, homework, support, notices, campuses, reports, websites — their internals are NOT VERIFIED.

## 1. Architecture

| Aspect | Assessment |
|---|---|
| Structure | One module; 24 controllers; providers for cross-cutting concerns (`Scope`, `Audit`, `Saas`, `Billing`, `PaymentService`, `Jobs`, `Realtime`, `Websites`). Pure rules in `domain/` (grading, fee allocation, workflow) with unit tests |
| Authorization | Centralised in `AccessGuard` + decorators; data scoping in `Scope` |
| Transactions | `Db.serial()` — Serializable with five attempts and linear backoff; pool errors mapped to 503 with `Retry-After` (`common.ts:39-61`) |
| Configuration | Core values validated at startup (`config.ts`); many business and integration values still read ad hoc from `process.env` (`payments.ts`, `jobs.ts`, `billing.ts`, `uploads.ts`) |
| Coupling | `DocumentsController` calls `ExamsController.results` directly (controller registered as a provider in `app.module.ts:84`) |
| Background work | Worker lives in the API process (`jobs.ts:62-80`) |

This is the most mature backend of the three: validated config, readiness probe, subscription and quota enforcement, maker-checker, idempotency.

## 2. Verified strengths

| Rule | Evidence |
|---|---|
| Fee payment idempotency and FIFO allocation inside a serializable transaction with a student row lock | `payment.service.ts:11-87` |
| Online payment verified with the gateway before settlement | `payments.ts:133-162` |
| Section capacity enforced under a row lock; plan quota checked in the same transaction | `students.ts:88-103`, `saas/policy.ts:88-117` |
| Marks entry: teacher must be assigned to the subject; term must be open and before deadline; all students in the section; publication requires complete marks | `exams.ts:101-211` |
| Attendance: no future dates, students must belong to the section, absence SMS delayed 30 minutes and skipped on approved leave | `attendance.ts:51-106`, `jobs.ts:141-178` |
| Waivers: different approver, principal threshold, cannot exceed fee head or outstanding | `fees.ts:89-168` |
| Closed sessions are read-only | `auth/scope.ts` |

## 3. Defects and gaps

| ID | Class | Finding | Evidence |
|---|---|---|---|
| R-B1 | CONFIRMED BUG | Maintenance runs every 60 s and each run loads **every** due or partial invoice of every tenant; on the 1st of the month it also re-runs invoice generation for every active fee structure of every tenant on each run — 1,440 times that day — with per-student sibling counts and upserts | `jobs.ts:75-79`, `:213-246`; `modules/billing.ts:31-69` |
| R-B2 | CONFIRMED BUG | One-time fee heads are generated only when the due month equals the session's first month, so students admitted later never receive admission/one-time fees. Sibling discount applies only to heads whose **name** matches `/tuition/i` | `billing.ts:13-20`, `:49-54` |
| R-B3 | CONFIRMED BUG | Fee receipt PDF is headed "Campus One" (the platform), not the institution, and lists internal invoice IDs. PDFs use pdfkit's built-in font, which cannot render Bangla text | `documents.ts:20-84` |
| R-B4 | MISSING FEATURE | No void, reversal or refund for fee payments; a wrongly keyed manual payment is permanent. Overpayment/advance is rejected. No ad-hoc invoice (exam fee, fine, uniform) outside fee structures | `payment.service.ts:30-31`, `fees.ts` |
| R-B5 | CONFIRMED BUG | `TimetableSlot` is unique on `(teacherId, dayOfWeek, period)` with no session dimension, and the API can only upsert slots, never delete them. Last session's timetable will block the same teacher's slots in the next session | `prisma/schema.prisma` (`TimetableSlot`), `academics.ts:149-178` |
| R-B6 | CONFIRMED ARCHITECTURAL WEAKNESS | Unpaginated lists: payments, leaves, users, platform organisations, subscription payments | `payments.ts:31-37`, `attendance.ts:108-113`, `users.ts:17-29`, `saas/controllers.ts:185-196` |
| R-B7 | MISSING FEATURE | Admission form captures only applicant name, guardian phone and optional email | `admissions.ts:54-63` |
| R-B8 | MISSING FEATURE | Subscription: no cancel or downgrade, no proration on plan change, no grace period, no renewal reminders, no pre-payment invoice | `saas/service.ts:144-192`, `saas/policy.ts:65-87` |
| R-B11 | MISSING FEATURE | Students: create one at a time; no bulk import, no profile edit endpoint; profile has name, code, date of birth, gender, blood group only. Roll number is "active count + 1" and can repeat after withdrawals | `students.ts:72-106` |
| R-B12 | MISSING FEATURE | Users: list and create only; no deactivate, role change, or reset. Guardian and student accounts need an email and a 12-character password set by an administrator | `users.ts:16-59` |
| R-B13 | MISSING FEATURE | Marks are one number per subject per term; no written/MCQ/practical components or component pass marks | `exams.ts:101-160` |
| R-B14 | CONFIRMED BUG | Placeholder customer contact data sent to the gateway | `payments.ts:91`, `:95` |
| R-B15 | CONFIRMED ARCHITECTURAL WEAKNESS | Waiver principal threshold (BDT 1,000), fine cap (BDT 500), due day (10th), offer window (48 h) are constants | `fees.ts:127`, `jobs.ts:221`, `:244`, `:298` |
| R-B16 | POTENTIAL RISK | SMS adapter expects a specific JSON contract (`{to, body, sender}` with Bearer auth and an `id` in the response); Bangladeshi providers differ, so a provider-specific adapter will be needed | `jobs.ts:113-135` |
| R-B17 | POTENTIAL RISK | New organisations get a calendar-year session (1 Jan – 31 Dec). Colleges and some institutions follow a mid-year session; confirm it is editable in `campuses.ts` | `saas/service.ts:74-87` |

## 4. API quality

- Consistent error body `{statusCode, message}`; 402 for subscription/feature/quota problems; 409 for conflicts; 503 with `Retry-After` when the pool is saturated.
- Students list is paginated with search (`students.ts:16-58`) — the only paginated list read.
- No API versioning or OpenAPI; `backend/docs/API.md` is maintained by hand.
- Mixed authorization style: some read routes rely on `Scope` filters without `@Roles` (attendance, leaves, results) — correct as written, but each new route must remember to scope.

## 5. Error handling and integrations

- Outbound calls (SSLCommerz, SMS) use 15-second timeouts; SMS jobs retry five times with exponential backoff and are de-duplicated by key.
- Gateway initiation failure returns 503; a `PENDING` payment row remains (no expiry clean-up).
- Unknown errors are logged with `console.error` without request context; no tracker.

## 6. Recommendations (ordered)

1. R-S1 (`trust proxy`) and the job fixes in R-B1 — both are small and prevent production incidents.
2. Per-organisation settings to replace environment-level business rules (R-S3, R-B15, R-B2 sibling discount by head ID).
3. Staff lifecycle (deactivate, role change, invite existing user, reset) and student bulk import + edit (R-B11, R-B12).
4. Fee corrections: void/reversal with reason and second approver; ad-hoc invoices; advance payments.
5. Timetable: add `sessionId`, unique per session, delete endpoint.
6. PDFs: institution header, logo, Bangla-capable font, human-readable invoice numbers.
7. Pagination on remaining lists.
8. Move the worker to its own process; select invoices needing fine updates once per day per organisation.
9. Read and test the unverified modules (library, transport, homework, lifecycle, websites) with tenant-isolation cases.
