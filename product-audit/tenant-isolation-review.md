# School & College ERP — Tenant Isolation Review

Static review at commit `2e11d6a`. The repository contains tenancy integration tests (`backend/test/saas.test.ts`, `integration.test.ts`) that could not be run locally (no PostgreSQL/Redis). No cross-tenant penetration test was executed.

## 1. Model

```
Organization (tenant, status ACTIVE|SUSPENDED, subscription)
 ├─ OrganizationMember (userId, role OWNER|ADMIN|MEMBER)
 └─ Campus (orgId)
     ├─ UserCampusRole (userId, role — 11 roles)
     └─ sessions, classes, sections, students, fees, notices, library, transport …
```

- Single database, shared schema. Tenant ownership is a `campusId` column or reached through a parent (`section → class → campus`, `invoice → student → campus`).
- `User` is global (`email` unique); one person can hold roles in several campuses and organisations.
- No PostgreSQL row-level security.

## 2. Request context — verified

`AccessGuard` (`backend/src/auth/access.ts:60-125`):

1. Verifies the JWT, loads the user and roles from the database, rejects inactive users and stale `tokenVersion`.
2. Takes `x-campus-id` from the request **only as a selector**: `roles = user.roles.filter(r => r.campusId === campusId)`. With no role in that campus the request is refused (unless the route is marked `@AccountAccess`).
3. Derives `orgId` from the role's campus, and requires an `OrganizationMember` row — removing membership cuts access even if a role row remains.
4. Applies `@Roles`, then `requireSubscription` for every non-GET request and for `@Feature` routes.
5. `@PlatformOnly` routes require `user.platformAdmin`.

`@AccountAccess` routes (`auth/*`, `POST saas/organizations`) run with a possibly arbitrary `campusId` and empty roles; they were checked and use only `ctx.userId`. **POTENTIAL RISK:** any future `@AccountAccess` handler that reads `ctx.campusId` would trust client input — add a lint rule or make `campusId` empty for those routes.

## 3. Data scoping — what was checked

| Area | Pattern | Result |
|---|---|---|
| Students, guardians | `Scope.studentFilter(ctx)`: staff by campus, teachers by assigned sections, guardian/student by relationship (`auth/scope.ts:8-36`) | Scoped |
| Attendance, leaves | `enrollment.student: studentFilter`, section checked against campus | Scoped |
| Results, report card | `scope.student` first; unpublished marks hidden from non-teaching roles | Scoped |
| Fee payments, receipts | `student: studentFilter`; manual payments restricted to finance roles | Scoped |
| Waivers, invoices | `student: { campusId }` | Scoped |
| Sessions, sections | `Scope.session`, `Scope.section` include campus | Scoped |
| Users | `roles: { some: { campusId } }` | Scoped |
| Admission documents | Application checked against campus before listing; download by short-lived signed token bound to the document ID | Scoped |
| SaaS summary, payments, receipt | `organizationId: ctx.orgId` + owner/admin check | Scoped |
| Realtime | Socket joins `campus:<id>` only after role and membership checks; guardians/students join only their user room (`realtime.ts:17-47`) | Scoped |
| Public admissions | Campus resolved by organisation slug; session and class must belong together | Scoped |
| Websites | Not read line by line | NOT VERIFIED |
| Library, transport, homework, support, lifecycle, notices | Route/role/feature decorators mapped; query scoping not read line by line | NOT VERIFIED |

No insecure direct object reference was found in the code that was read.

## 4. Confirmed weaknesses

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| R-S2 | High | **Fee payment gateway is platform-wide.** `PAYMENT_MODE`, `SSLCOMMERZ_STORE_ID` and `SSLCOMMERZ_STORE_PASSWORD` are process environment values, so online fee payments for every school go to one merchant account. There is no per-organisation credential and no settlement ledger | `modules/payments.ts:38-110` |
| R-S3 | High | **Tenant business rules are global environment variables:** late fine per day, sibling discount, fee reminders on/off, admission offer hours; invoice due day (10th) and waitlist offer window (48 h) are hard-coded | `jobs.ts:217-221`, `:235-246`, `:247`, `:298`; `modules/billing.ts:33` |
| R-S4 | Medium | **SMS is platform-wide and unmetered:** one provider credential, no per-tenant quota or credit | `jobs.ts:93-140` |
| R-S1 | High | **Rate-limit buckets are shared by all tenants** because `trust proxy` is never set: registration (10/hour) and admission applications (20/minute) limits apply to the whole platform | `main.ts:25-28`, `:62-65`; no `trust proxy` in `src` |
| R-T1 | Medium | Background jobs iterate all tenants without checking organisation status or subscription: fines accrue and invoices are generated for suspended or expired tenants | `jobs.ts:179-246` |
| R-T2 | Low | Globally unique keys: `SmsMessage.dedupeKey`, `Payment.idempotencyKey`, `Payment.providerRef`. Keys built in code include entity IDs, so collisions are unlikely | schema; `jobs.ts:174`, `:205` |
| R-T3 | Low | `Payment` carries no campus/organisation column; tenant is reached through the student | schema |
| R-T4 | Medium | A person who already has an account (another school's teacher, a guardian with children in two schools) cannot be added: `POST users` always creates a new `User` and fails on the unique email | `modules/users.ts:31-59` |
| R-T5 | Low | Tenant data export and deletion/retention procedures do not exist | — |
| R-T6 | Low | Files for all tenants live in the shared database (`bytea`), not in tenant-prefixed storage | schema |

## 5. Tenant-level controls that exist (keep)

- Organisation suspension blocks all writes (`saas/policy.ts:74-75`).
- Subscription expiry returns 402 on writes and gated features.
- Quotas for campuses, students and staff are checked inside a serializable transaction with a row lock on the organisation (`saas/policy.ts:88-117`).
- Feature entitlements per plan (`library`, `transport`, `homework`, `support`).
- Closed academic sessions are read-only (`auth/scope.ts:42-43`, `:52-53`).
- Guardians see only their children; students only themselves — appropriate for minors' data.

## 6. Recommended strategy

Keep the shared-schema, `Organization → Campus` model. A database per school is not warranted.

1. **Per-organisation settings table** (`OrganizationSettings` or JSON on `Campus`): late-fine policy (none / per day / flat, cap), invoice due day, sibling discount rules by fee head ID, reminder schedule, admission offer hours, receipt header, grading scale choice. Remove these from environment variables.
2. **Per-organisation payment configuration:** each school's own gateway credentials (encrypted at rest) or a clearly documented platform-collection model with a per-tenant settlement ledger. Until then keep online fee payment disabled.
3. **Per-organisation SMS credit ledger** with purchase, consumption and a hard stop at zero.
4. **`trust proxy`** and tenant-aware limits (key by organisation slug for public endpoints).
5. **Job tenant checks:** skip suspended/expired organisations; select work by organisation in batches.
6. **Invite existing users:** adding a staff member or guardian by email/phone should attach a role to an existing `User`.
7. **Defence in depth:** a Prisma extension that requires a campus/organisation condition for tenant models, plus an automated isolation test matrix over all routes (extend `saas.test.ts`).
8. **Tenant export/deletion:** organisation-level export bundle; retention schedule for withdrawn students and closed organisations.

## 7. Minors' data

Students are mostly minors. Present safeguards: guardian-scoped access, encrypted admission documents, no public student search, results published only on purpose. Gaps: no privacy notice/consent capture at admission, no retention policy, report-card and receipt PDFs are not watermarked or access-logged, platform administrators have no audited "support access" path (they have no tenant data routes at all today, which is safe but will change). Public result lookup on school websites (`websites/results.ts`) was not reviewed — verify it requires roll/registration plus a second factor such as date of birth and is rate-limited.

## 8. Verdict

Isolation logic is deliberate and consistent in the code read, and noticeably ahead of the other two products. The remaining risks are configuration-level multi-tenancy (payments, fines, SMS, rate limits) rather than data leakage.
