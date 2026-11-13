# School & College ERP — UI/UX Audit

**Method and limits.** Based on route structure, navigation definition, shared hooks and greps over `frontend/src`; pages were not read line by line and nothing was rendered. Visual quality, contrast and real device behaviour are NOT VERIFIED. The repository contains automated accessibility and mobile checks (`e2e/accessibility.spec.ts`, `e2e/workflows.spec.ts:63`) that were not run here.

## 1. Summary

The product has the most complete user-facing surface of the three: a marketing landing page with pricing, self-service institution sign-up, a role-aware workspace, a guardian/student portal, a platform console and tenant school websites. Commit history shows deliberate work on contrast, minimum font size and keyboard controls. The main usability risks for Bangladeshi schools are: English-only interface, one-by-one data entry for students and staff, email-and-password accounts for guardians, and administrative breadth that a small school office will find heavy on day one.

## 2. Navigation and information architecture

Seventeen items in `components/shell.tsx`, grouped, each with a role list: School website, Overview, Students, Admissions, Attendance, Academics, Exams & results, Fees & payments, My family, Notice board, Homework, Library, Transport, Help & requests, Subscription, Reports & insights, Settings.

| Observation | Recommendation |
|---|---|
| "School website" is the first item for admins | Move below core ERP items or into Settings; it is not a daily task |
| Admin sees 15+ items | Group as **People** (Students, Admissions, Staff), **Academics** (Attendance, Timetable, Exams, Homework), **Finance** (Fees, Reports), **Communication** (Notices, Help), **Modules** (Library, Transport, Website), **Account** (Subscription, Settings) |
| Staff/user management lives in Settings | Give "Staff" its own entry |
| Teachers | Home should be "Today": my classes, take attendance, pending marks, notices |
| Guardians | "My family" as landing page with child switcher, dues, attendance this month, latest result, notices |
| Campus and session switching stored in `localStorage` | Show the active campus and session clearly in the header; warn when viewing a closed session |

## 3. Onboarding

`/start` creates organisation, main campus, a calendar-year session and a grading scale, then drops the owner into the workspace on a 14-day trial. What follows is manual: classes, sections, subjects, teachers, students, fee structures — each created one at a time.

Recommended setup assistant (checklist with progress, skippable):

1. Institution type (school / college / madrasa / coaching) and session dates — colleges and some institutions do not use January–December.
2. Classes and sections from templates (Play–10, 11–12 with groups).
3. Subjects from a template per class; adjust.
4. Import students from Excel (template download, row-level error report, guardian phone columns).
5. Invite teachers by phone/email; assign class teachers.
6. Fee structure wizard: monthly tuition per class, admission fee, exam fee; fine and discount policy.
7. Send guardian access by SMS.

Fourteen days is short for a school to load data and see value; consider 30 days or "trial until first invoice run".

## 4. Screen-level recommendations

| Screen | Source size | Recommendations |
|---|---|---|
| Overview | 362 lines | Role-specific; three key numbers for admins (present today, collected this month, dues outstanding) with links |
| Students | list 221, detail 180 | Bulk import/export, inline edit, photo, guardian quick-add by phone, filters by class/section/status, print ID card later |
| Admissions | 320 | Configurable application form fields; application fee option; status board |
| Attendance | 306 | Default all present, tap to mark absent; big touch targets; "save" shows who will be notified; offline-tolerant save |
| Academics | 321 | Timetable grid per section and per teacher; copy from previous session; delete slots |
| Exams | 371 | Spreadsheet-style marks grid with keyboard navigation and paste from Excel; component columns; tabulation sheet and merit position print |
| Fees | 466 | Counter mode: search student by ID/name/phone → dues → collect → print receipt in under 20 seconds; daily collection summary; void with approval |
| Guardian | 262 | Bangla first; dues and "pay now" or "how to pay"; attendance calendar; result with download |
| Notices | 195 | Templates; preview of SMS length and cost; Bangla default |
| Subscription | 304 | Clear state (trial days left), how to pay with step-by-step bKash/Nagad instructions, invoice before payment, receipt after |
| Platform | 540 | Split into Tenants, Payments, Plans, Settings tabs with search and pagination |
| Website editor | 1,398 | Defer; simplify to a few templates |
| Apply (public) | 175 | Bangla; school branding; clear confirmation with application number and SMS |

## 5. Missing screens

Forgot/reset password; staff management (deactivate, roles, reset); student edit and bulk import; fee/fine/discount policy settings; receipt and report-card template settings (logo, header, signatures); SMS balance and purchase; payment reconciliation; tabulation sheet; certificates (testimonial, transfer certificate); ID cards; staff attendance; data export; privacy notice/consent in admission.

## 6. Forms, tables, dialogs, states

- Shared primitives in `components/ui.tsx` (400 lines); feature gating through `components/module-gate.tsx` with upgrade messaging.
- `useData` exposes `loading` and `error` for every fetch — pages can show consistent states.
- No `confirm(` usage found; verify that publish results, approve waiver, promote students, transfer and suspend organisation have explicit confirmations with consequences stated.
- Server messages are user-readable in most guards ("Section is full", "Your current plan does not include …"); validation errors are raw zod paths.

## 7. Bangladesh-specific usability

| Need | Current | Recommendation |
|---|---|---|
| Bangla | English UI; optional Bangla notice body | Full Bangla locale; Bangla names in data and PDFs; English/Bangla toggle per user |
| Guardian access | Email + 12-character password set by admin | Phone number + OTP; SMS with link; one guardian, many children |
| Devices | Mobile checks exist in tests; 8 media queries in `globals.css` | Teachers and guardians on low-end Android first; office staff on desktop |
| Connectivity | Online only | Attendance should queue offline and sync |
| Printing | PDFs in English, basic layout | Receipt (A5/POS), report card and tabulation with school header, logo, Bangla font, signatures |
| Grading | NCTB-style GPA scale seeded per campus | Let each institution confirm/edit its scale and pass marks; current national rules should be confirmed with pilot schools rather than assumed |
| Payments | Manual counter; optional gateway | Counter mode first; "pay by bKash to school number + reference" instructions; gateway later |
| Minimal typing | One-by-one entry | Imports, templates, copy-from-last-session |

## 8. Accessibility checklist

| Item | Status |
|---|---|
| Automated axe checks in the test suite | Present; NOT RUN |
| Minimum font size check on mobile | Present in tests; NOT RUN |
| Keyboard controls on landing previews | Test present; NOT RUN |
| `lang` attributes | `en` root; `bn` on Bangla notice body |
| Contrast | Commit history mentions fixes; NOT VERIFIED |
| Focus management in dialogs | NOT VERIFIED |
| Data tables with headers/captions | NOT VERIFIED |

## 9. Design system

Tokens and primitives already exist; consolidate the four stylesheets around shared variables, add a server-paginated DataTable, a spreadsheet-like Grid for marks and attendance, ConfirmDialog with consequence text, and print templates. Share tokens with the other products where it saves effort.

## 10. Implementation-ready UI/UX fixing prompt

```text
You are improving the Campus One frontend (frontend/src). Keep API contracts unless a task names a backend change. One task per PR; run `npm run typecheck` and Playwright after each.

1. Navigation (components/shell.tsx): regroup items into People / Academics / Finance / Communication / Modules / Account; add a Staff entry; role-specific landing pages (teacher "Today", guardian "My family"); show active campus and session in the header with a closed-session warning.
2. Setup assistant: checklist page shown to SUPER_ADMIN until complete (classes, subjects, students import, staff, fee structure), with progress stored per organisation (backend flag).
3. Students: Excel/CSV import with template and row-level errors; edit form; guardian quick-add by phone (requires backend).
4. Attendance: default-present grid with large toggles; optimistic save; offline queue with retry.
5. Marks grid: keyboard navigation, paste from spreadsheet, validation highlights; component columns when the backend supports them.
6. Fees counter mode: search → dues → collect → print; daily summary; void request dialog (requires backend).
7. i18n: English and Bangla dictionaries for workspace, guardian portal, /apply and /start; per-user language preference; <html lang> follows it.
8. ConfirmDialog for: publish results, approve waiver, promote/transfer, suspend organisation, delete timetable slot.
9. Event-scoped refresh: in shell.tsx dispatch `campus-refresh:<event>`; update use-data.ts to accept the events a view depends on.
10. Subscription page: trial countdown, payment instructions, invoice preview, receipt list.
Acceptance: a new school can go from sign-up to "attendance taken for one class" in under 60 minutes using the assistant and import; guardian portal fully usable in Bangla on a 360 px screen; every irreversible action confirmed; Playwright accessibility spec passes.
```
