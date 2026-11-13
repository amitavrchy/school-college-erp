# School & College ERP — Product Roadmap

Complexity: S ≤ 3 days, M ≤ 2 weeks, L > 2 weeks (one experienced engineer). Effort, not calendar.

## Positioning

- **Customer:** privately run schools, kindergartens and colleges in Bangladesh with 150–1,500 students.
- **Problems:** fee collection and dues tracking on paper or Excel; guardians uninformed about absence, dues and results; result processing by hand each term; office time lost to registers.
- **Alternatives:** registers and Excel; locally developed desktop/web systems sold with on-site support; per-student SaaS vendors.
- **Proposition:** start in a day without a salesperson; accurate fees with receipts; guardians informed by SMS and portal; results published in one click.
- **Protect:** access guard and scope model, fee payment engine, subscription/quota layer, admission workflow, tests.

## Roadmap 1 — Minimum lovable commercial launch

| # | Item | Complexity | Depends on | Value |
|---|---|---|---|---|
| 1 | Incident response; CI active with Postgres + Redis; deploy gate | S | — | Safety |
| 2 | `trust proxy`; Redis-backed rate limits | S | — | Sign-up and admissions usable under load |
| 3 | Job schedule split; worker container; skip suspended tenants | S–M | — | Stability at month start |
| 4 | Organisation/campus settings (fines, discounts by fee head, due day, reminders, offer window, receipt header/logo) | M | — | Schools control their policy |
| 5 | Student import + edit + extended profile; roll number rules | M | — | Onboarding possible |
| 6 | Staff lifecycle; attach existing users; password reset; sign-up verification and trial limit | M | Notification delivery | Administration and security |
| 7 | Fee corrections (void with approval), ad-hoc invoices, mid-session one-time fees | M | 4 | Correct books |
| 8 | Branded receipts and report cards with Bangla font | M | 4 | Parent-facing quality |
| 9 | Timetable per session | S | — | Second-year readiness |
| 10 | Subscription reminders, grace, invoice before payment | S–M | — | Revenue operations |
| 11 | SMS adapter for a contracted Bangladeshi provider; per-school credit ledger | M | Provider contract | Core value + add-on revenue |
| 12 | Bangla locale for guardian portal, public forms, then workspace | M | — | Adoption |
| 13 | Setup assistant with templates | M | 5 | Time to value |
| 14 | Managed Postgres with PITR, object storage for files, monitoring, real domain | M | — | Reliability |
| 15 | Review + tests for lifecycle, library, transport, homework; disable website CMS by default | M | — | Known quality |
| 16 | Security headers, MFA for admins | S–M | — | Security |

## Roadmap 2 — Competitive SaaS product

| Item | Complexity | Depends on | Value |
|---|---|---|---|
| Guardian access by phone + OTP; SMS invitations | M | 11 | Portal adoption |
| Exam components, pass rules, tabulation sheet, merit position, bulk print jobs | M | 8 | Result season |
| Fee counter mode, daily collection report, dues reminders | M | 7, 11 | Accounts office speed |
| Student-band pricing and plan migration | S–M | 10 | Fit for small schools |
| Hosted checkout for subscriptions | M | Merchant account | Less manual review |
| Configurable admission form with application fee | M | — | Admission season |
| Certificates and ID cards | M | 8 | Frequent requests |
| Groups/departments and optional subjects | M | — | Secondary/higher-secondary fit |
| Event-scoped refresh; guard caching; indexes | S–M | — | Performance |
| Staff attendance and leave | M | — | Completeness |
| Data export; platform operator reporting and support access | M | — | Trust, operations |
| Offline-tolerant attendance | M | — | Connectivity |

## Roadmap 3 — Long-term expansion

| Item | Complexity | Precondition |
|---|---|---|
| Per-school online fee collection with settlement ledger or school-owned gateway credentials | L | Legal/commercial review |
| Payroll | L | Demand from paying schools |
| Guardian mobile app | L | Portal adoption evidence |
| School website CMS as paid add-on | M | Security review, real domain, support capacity |
| White-label ERP | M | Larger customers |
| Hostel, inventory, expense/accounting | L | Demand |
| Biometric device integration | M | Hardware partners |
| Consolidated multi-campus analytics | M | Group customers |

## Sequencing notes

- Items 1–3 are days of work and remove the most likely production incidents; do them before any pilot.
- Items 4–8 decide whether a real school can complete a fee cycle without your intervention.
- A free pilot can start after items 1–3, 5 (import), 9 and 14, with policy settings applied manually for the pilot school.
- The pre-session buying window is short; prioritise import, fees and SMS over exams if the pilot starts at the beginning of a session.
