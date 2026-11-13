# School & College ERP — User Journeys

Traced from source at commit `2e11d6a`. Steps in modules that were only mapped (lifecycle, library, transport, homework, websites) are marked NOT VERIFIED.

## 1. School owner: discover → trial → paying customer

**Today**

1. Landing page with pricing and role previews (`components/landing.tsx`).
2. `/start`: institution name, slug, campus name, plan, period, owner name, email, password → organisation, main campus, calendar-year session, grade scale and a 14-day trial are created; owner is signed in (`saas/service.ts:28-99`).
3. Workspace opens with empty data.
4. Subscription page: choose plan/period, pay to the platform's bKash/Nagad/bank details, submit the transaction reference (`saas/controllers.ts:95-142`).
5. Platform admin confirms the exact amount → subscription active; receipt PDF available.

**Friction**

- No verification of the owner's email or phone; no way to recover a forgotten password.
- Trial ends with a hard stop on all writes; no reminder beforehand.
- Fourteen days rarely covers data loading plus one fee cycle.

**Target:** phone OTP at sign-up → setup assistant → import students → first attendance and first invoices within the trial → reminders at 7/3/1 days → pay (manual reference or hosted checkout) → 7-day grace if late.

## 2. Office administrator: initial setup

**Today:** create classes (`POST classes`), sections with capacity, subjects, teacher accounts (email + 12-character password each), teacher–subject assignments, timetable, holidays, fee structures; add each student individually with section; create guardian users and link them.

**Friction:** for a 600-student school this is several days of typing; no import; students and staff cannot be edited or deactivated afterwards; guardians need email addresses.

**Target:** templates + Excel import + invitations by phone (see `ui-ux-audit.md` §3).

## 3. Class teacher: morning attendance

**Today** (`attendance.ts:51-106`, `jobs.ts:141-178`)

1. Open Attendance, pick section and date.
2. Mark each student present/absent/late/leave; save (max 200 records).
3. For period 0 absences an SMS job is queued with a 30-minute delay; skipped if an approved leave exists; SMS is simulated unless a provider is configured.
4. Other staff screens refresh.

**Friction:** teacher must be online; no "all present" shortcut verified; correction window rules not verified.

**Target:** default-present grid; one-tap save; offline queue; guardian notified through the channel the school paid for.

## 4. Teacher: marks to published results

**Today** (`exams.ts`)

1. Academic admin creates a term and opens entry.
2. Assigned teacher enters one mark per student per subject (max marks per entry), before the deadline.
3. Admin moves the term to moderation and publishes; publication fails unless every active student has marks for all assigned subjects.
4. Guardians and students see published results and can download a report card.

**Friction:** no written/MCQ/practical components; no tabulation sheet or merit position; report card is a plain English PDF.

**Target:** component-wise entry with pass rules, tabulation sheet, class position, school-branded bilingual report card, bulk print.

## 5. Accounts officer: monthly fees

**Today**

1. Fee structure per class and session with heads and frequencies (`fees.ts:44-72`).
2. Invoices generated manually (`POST fees/generate`) or automatically on the 1st with due date the 10th (`jobs.ts:235-246`).
3. Guardian pays at the counter → officer records a manual payment → FIFO allocation → receipt PDF (`payment.service.ts`, `documents.ts:61-85`).
4. Late fines accrue daily by a global rule; waivers need a second approver (principal above BDT 1,000).
5. Fee-collection report.

**Friction:** fines and sibling discounts are not controlled by the school; one-time fees are missed for mid-year admissions; a wrong entry cannot be voided; receipts carry the platform's name; no advance payment; no daily cash summary verified.

**Target:** school-level fee policy; counter mode; void with approval; ad-hoc invoices; branded receipts; day-end collection report; optional online payment into the school's own account.

## 6. Guardian

**Today:** an administrator creates a user with role GUARDIAN (email and password), links the user to students; guardian signs in and sees "My family", attendance, published results, invoices, notices, homework/library/transport if the plan includes them.

**Friction:** email requirement; English interface; cannot pay online in default configuration; no SMS with access details.

**Target:** phone-based access by SMS link/OTP; Bangla; dues with clear payment instructions; push/SMS for absence, results and dues.

## 7. Applicant family: online admission

**Today:** `/apply?school=<slug>` → choose campus, session, class → applicant name and guardian phone → application ID and a 24-hour upload token → upload up to five documents → school reviews, generates a merit list, offers a seat with a token link → offer expires (48 h) and the next waitlisted applicant is offered automatically (`jobs.ts:266-306`).

**Friction:** too little data for a real admission decision; no application fee; no SMS confirmation by default.

**Target:** configurable form per school (student details, parents, address, previous school, photo), optional application fee, SMS confirmation and status tracking page.

## 8. Year end: promotion and new session — NOT VERIFIED in detail

Routes exist for promotion with hold lists and for campus transfer with prorated dues (`lifecycle.ts`). Known defect on the path: timetable slots of the old session block the new session's timetable (R-B5).

## 9. Platform operator

**Today:** `/platform` — tenants with subscription and counts, payment queue, plans, settings (receiving account numbers, instructions), organisation detail with usage and events, suspend/reactivate, grant with reason and idempotency key, platform audit.

**Friction:** unpaginated dashboard; no tenant impersonation/support view; no revenue reporting beyond a recorded total; no MFA.

**Target:** searchable tenant list, expiring-soon queue, audited read-only support access, MFA, monthly revenue and churn view.

## 10. Priority

| Journey | Blocks revenue | Blocks daily use | Priority |
|---|---|---|---|
| 2 Setup (import, edit, staff lifecycle) | Yes — schools will not finish onboarding | Yes | P0 |
| 5 Fees (school policy, void, branding) | Trust | Yes | P0 |
| 1 Trial reminders, grace, password reset | Yes | — | P0 |
| 6 Guardian access by phone, Bangla | Value perception | Yes | P1 |
| 4 Exam components, tabulation, report card | Yes for many schools | Seasonal | P1 |
| 3 Attendance ergonomics, SMS | — | Yes | P1 |
| 7 Admission form | Seasonal | — | P2 |
| 9 Operator tooling | Scale | — | P2 |
