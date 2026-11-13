# School & College ERP — Missing Features

"Missing" = not found in source at `2e11d6a` (modules that were only mapped are noted where relevant). P0 launch blocker, P1 core commercial, P2 retention/competitive, P3 future. Effort: S ≤ 3 days, M ≤ 2 weeks, L > 2 weeks.

## P0 — required before charging schools

| Feature | Why | Effort |
|---|---|---|
| `trust proxy` + Redis-backed, per-client rate limits | Platform-wide throttling of sign-ups and admissions (R-S1) | S |
| Job schedule fixes; worker in its own process | Month-start storm, every-minute full scans (R-B1) | S–M |
| Per-organisation settings for fines, discounts, due day, reminders, admission offer window | Each school has its own policy (R-S3) | M |
| Student bulk import and profile editing; richer profile fields | Onboarding is otherwise impractical (R-B11) | M |
| Staff lifecycle: deactivate, change role, reset password; attach existing user | Basic administration (R-B12, R-T4) | M |
| Password reset; verification at sign-up; trial limits | Account recovery and abuse control (R-S5) | M |
| Fee payment void/reversal with approval; ad-hoc invoices | Counter mistakes happen daily (R-B4) | M |
| Institution-branded receipts and report cards with Bangla-capable font | Documents handed to parents (R-B3) | M |
| Timetable per session with delete | Breaks at the second session (R-B5) | S |
| One-time fees for mid-session admissions; discount flag per fee head | Billing correctness (R-B2) | S |
| Subscription reminders and grace period | Avoids locking a school out without warning (R-B8) | S |
| Backups with PITR, monitoring, active CI | Operational minimum | M |
| Keep online fee payment disabled until per-school settlement is designed | R-S2 | — |

## P1 — core commercial

| Feature | Notes | Effort |
|---|---|---|
| Bangla interface (workspace, guardian portal, public forms) | See `ui-ux-audit.md` | M |
| Guardian access by phone + OTP; SMS invitations | Guardians rarely use email | M |
| SMS provider adapter for a Bangladeshi gateway; per-school SMS credits and purchase flow | Monetisable and prevents unmetered cost (R-S4) | M |
| Exam components (written/MCQ/practical), pass rules, tabulation sheet, merit position | Common exam structure — confirm exact rules with pilot schools | M |
| Fee counter mode and daily collection report | Accounts office workflow | M |
| Setup assistant with class/subject templates | Time to value | M |
| Configurable admission form; application fee | Admission season | M |
| Departments/groups (Science, Business Studies, Humanities) and optional (4th) subject handling | Secondary and higher-secondary structure — verify current rules | M |
| Session date flexibility for colleges and other institution types | Calendar-year default today (R-B17) | S |
| Certificates: testimonial, transfer certificate; student ID cards | Frequent office requests | M |
| Data export per organisation | Trust and off-boarding | S |
| Hosted checkout for subscription payments | Reduce manual review | M |
| MFA for platform and school admins | Security | S–M |

## P2 — retention and competitive

| Feature | Notes | Effort |
|---|---|---|
| Staff attendance and leave | Common request | M |
| Payroll (salary structure, monthly sheet, payslip) | High value, high complexity; start with salary sheet export | L |
| Per-school online fee collection (own merchant credentials or bKash/Nagad payment instructions with reference matching) | After settlement design | L |
| Guardian mobile app/PWA with push | Engagement | M |
| Offline-tolerant attendance | Connectivity | M |
| Expense tracking / simple income-expense report | Completes finance picture | M |
| Bulk report-card and receipt printing via background jobs | Result day | S–M |
| Promotion wizard polish; alumni records | Year end | S |
| Multi-campus consolidated reports | Scale plan value | M |
| White-label (custom domain, logo, colours) for the ERP itself | Premium tier | M |

## P3 — future

Hostel management; inventory/assets; online assignments with file uploads and grading (homework module exists — extend only on demand); LMS integrations; biometric attendance device integration; national examination board data formats; public API; AI-assisted features below.

## Optional modules — commercial value versus cost

| Module | State in code | Value | Cost to finish/support | Recommendation |
|---|---|---|---|---|
| Library | Implemented (not verified) | Medium for larger schools | Low | Keep as Growth-plan feature after review |
| Transport | Implemented (not verified) | Medium (urban private schools) | Low–medium | Same |
| Homework | Implemented (not verified) | Medium; depends on teacher adoption | Low | Include in all plans |
| Support tickets | Implemented (not verified) | Low for schools; useful for you | Low | Keep |
| School website CMS + custom domains | Implemented, large | Medium; sells well in demos | High (security surface, DNS/TLS support) | Disable for first customers; later paid add-on |
| Online admission | Implemented, thin form | High in admission season | Medium | Finish in P1 |
| Hostel | Not implemented | Low for most day schools | Medium | Defer |
| Certificates | Not implemented | High frequency, simple | Low | P1 |
| Online assignments / LMS | Partial (homework) | Low–medium | High | Defer |

## AI opportunities (evaluated)

| Idea | Problem | Data | Complexity / cost | Risks | Simpler alternative | Verdict |
|---|---|---|---|---|---|---|
| Import assistant: map messy Excel columns to student fields | Onboarding data is inconsistent | Uploaded sheet headers and sample rows | Low; small model call per import | Wrong mapping — must be confirmed by the user | Manual column mapping UI | Useful P1/P2 helper with confirmation |
| Draft notices in Bangla/English | Office staff write slowly | Short prompt | Low | Tone or factual errors | Templates | Optional P2 |
| Report-card remarks suggestions | Teachers write repetitive remarks | Marks, attendance | Low | Inappropriate remarks about a child | Remark bank picklist | Remark bank first |
| At-risk student flags | Dropout/absence trends | Attendance, marks, dues | Medium | Stigmatising minors; false positives | Simple rules (absent 5 of last 10 days) | Rules only |
| Chatbot for guardians | Reduce office calls | School data | High | Wrong answers about fees/results; privacy | Clear portal + SMS | Do not build now |

Privacy: this product holds minors' data. Do not send student-identifying data to external model providers without a lawful basis, the school's agreement and guardian notice.
