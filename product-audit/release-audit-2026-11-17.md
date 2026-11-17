# Campus One (School & College ERP) — release audit, 2026-11-17

Product: multi-tenant school ERP SaaS for Bangladesh (admissions, students, attendance, exams, fees, notices, library, transport, homework, support, school websites), with a platform console for subscriptions and one Flutter app build per school (demo profile: Scholars Academy).

Audited commit: `d69198d` on `main` (clean tree before this audit). Changes made during the audit are listed in section 3 and are uncommitted in the working tree.

## 1. Scope, environment and coverage

Environment (local, synthetic data, no production access):

| Component | Build / run | Notes |
|---|---|---|
| API (NestJS 11, Prisma 6, Postgres, Redis/Valkey) | built from source, :4001 | `PAYMENT_MODE=manual`, console SMS/email with `OTP_DEBUG=true`, jobs in-process |
| Web (Next 16) | `next build` + `next start` on :3001 | production build, CSP/HSTS headers |
| Mobile (Flutter 3.47) | iOS simulator debug build, `scholars` profile, iPhone 17e / iOS 27 | launch and language screen verified; sign-in not driven on device |
| Database | fresh `campus_audit`, 11 migrations, platform bootstrap + demo seed (2 campuses, 200 students) | no legacy data |

Roles exercised: platform owner, institution owner/SUPER_ADMIN, CLASS_TEACHER, ACCOUNTS, GUARDIAN (web and app OTP), plus a second school for isolation checks.

Coverage matrix (RV = runtime verified, CR = code reviewed only, B = blocked, NA = not applicable):

| Area | Web | Mobile | API | Platform |
|---|---|---|---|---|
| Self-service school sign-up with OTP, trial, trial-reuse block, setup checklist | RV (browser + 68-step API journey) | NA | RV | RV |
| Login, MFA, logout, password reset by code, session invalidation | RV | CR + 22 widget tests | RV | RV |
| Classes/sections, admission, duplicate roll, search, attendance, correction | RV | CR (attendance screen) | RV | NA |
| Fee structure, invoice generation (idempotent), manual payment, receipt PDF | RV | CR (fees screen) | RV | NA |
| Guardian app OTP sign-in, refresh rotation and reuse revocation, child-only data | RV (API) | CR | RV | NA |
| Tenant isolation (other school's student, receipt, attendance; campus header spoof) | RV | NA | RV | NA |
| Subscription payment request → platform review → ACTIVE → receipt PDF; suspension | RV | NA | RV | RV |
| Exams, notices, homework, library, transport, support, websites | RV (browser suite + 39 integration tests) | CR | RV | NA |
| Online fees (SSLCommerz), real SMS/email, push (FCM) | B (sandbox credentials absent; manual mode verified) | B | B | B |
| Store builds, signing, update gate URLs | B (debug simulator build) | B | NA | NA |
| Backups, restore, deploy rollback | CR (added this audit) | NA | NA | NA |

Automated results at the audited commit:

| Suite | Result |
|---|---|
| Backend typecheck + unit (`npm test`) | 20/20 |
| Backend integration (`test:integration` against local API) | 39/39 |
| Browser suite (Playwright, Chrome; includes axe accessibility and i18n) | 10/10 before and after changes |
| Flutter analyze / test | clean / 22 passed |
| npm audit (backend, frontend) | 0 vulnerabilities |
| API journey script (owner, teacher, guardian, second school admin, platform; 68 checks) | 68/68 |
| Page sweep: 114 page/viewport checks (375 / 820 / 1440), 6 roles | 2 real findings (C-01, C-02), load < 0.3 s |

Observed journey timings (local): sign-up to first admitted student with attendance marked in 6 API calls; the setup checklist shows the remaining steps after sign-up. First meaningful outcome for a school is the first attendance register or the first fee receipt; for a guardian it is the child's dashboard after OTP sign-in.

## 2. Findings

| ID | Sev | Roles / surfaces | Expected | Actual | Evidence | Status |
|---|---|---|---|---|---|---|
| C-01 | P1 (operational) | Operator | Pre-deploy backup, health check and rollback; a backup/restore procedure for a system holding minors' data | Deploy ran `migrate deploy` then `up -d` with no backup, no health gate and no rollback; no backup or restore script existed | `.github/workflows/deploy.yml`, `deploy/` (no `scripts/`) | **Fixed**: `deploy/scripts/{backup,restore-drill,release}.sh`, workflow and README updated; shell syntax checked, not executed against a server |
| C-02 | P2 | All workspace roles, tablet width (741–960 px) | No horizontal page scroll | Top bar (campus select, session chip, locale, bell, avatar) pushed the page 4–30 px wider than the viewport on 12 of 17 admin pages and on guardian fees/support | sweep `admin--_subscription--tablet.png` (30 px) | **Fixed** in `globals.css`; retest sweep 0 px overflow on all 26 checks, browser suite 10/10 |
| C-03 | P2 | SUPER_ADMIN, PRINCIPAL | Clear message when the website module is off | Direct visit to `/website` showed "Something needs attention — School website not found — Try again" (API 404 because the platform has not enabled the module) | `admin--_website--desktop.png` | **Fixed**: page now explains the module is not enabled and who to contact |
| C-04 | P2 | Buyer, operator | Legal pages with a named provider | Privacy, terms and refund pages render "Draft — pending legal review" and "Provider: [Company name to be confirmed]" unless `NEXT_PUBLIC_COMPANY_NAME` is set | `frontend/src/components/legal-page.tsx` | Open, owner: business/legal |
| C-05 | P2 | Operator | Store-ready mobile builds | Gradle release falls back to debug signing without `key.properties`; iOS unsigned; `APP_STORE_URL` for the update gate unset; push is `NoPush` until FCM is configured | prior QA-04/QA-06, `mobile/scripts/build-school.sh` | Open, owner: mobile release |
| C-06 | P2 | Operator | Sign-up and reset codes reach users | With `SMS_PROVIDER`/`EMAIL_PROVIDER=console` (the shipped default) codes are not delivered, so no school can sign up in production | `deploy/.env.example`, `backend/src/config.ts` | Open, owner: ops (provider contract) |
| C-07 | P3 | Public | One `h1` per page | `/login` and `/start` have two `h1`s (story panel + form) | sweep | Open |
| C-08 | P3 | Operator | Clean sign-up limiter behaviour for offices behind one IP | `/api/saas/register` is limited to 10 per hour per IP; a shared NAT (school office, reseller demo) hits 429 | `backend/src/main.ts` | Open, decide limit |
| C-09 | P3 | Guardian/teacher | Platform-wide `trust proxy` set | `TRUST_PROXY` documented and required in `.env`; verify on the host after deploy | `deploy/README.md` | Open (ops check) |

Verified correct (no finding): tenant isolation on every tested read/write, campus header spoof refused, role matrix (teacher cannot read fees or create admins; guardian cannot pay or reach platform), refresh-token reuse revokes the chain, password reset and logout bump `tokenVersion`, cross-origin writes refused, duplicate roll/reference/payment idempotency, exact-amount approval, suspended-organisation write block, subscription grace policy, encrypted documents with capability tokens, CSP/HSTS/nosniff, 0 npm vulnerabilities, axe checks in the browser suite.

## 3. Changes made

| File | Change | Verification |
|---|---|---|
| `deploy/scripts/backup.sh` (new) | Encrypted `pg_dump` with optional S3 copy and retention | `bash -n`; mirrors the Utsab script already used in that product's pipeline; not run against a server |
| `deploy/scripts/restore-drill.sh` (new) | Restore into a throwaway Postgres container and count core tables | `bash -n` |
| `deploy/scripts/release.sh` (new) | backup → pull (retries) → migrate → up → health check (`/api/health`, frontend) → rollback to previous tag | `bash -n` |
| `.github/workflows/deploy.yml` | Uploads the scripts and calls `release.sh` instead of inline pull/migrate/up | YAML unchanged in structure; CI not run here |
| `deploy/.env.example`, `deploy/README.md` | `BACKUP_PASSPHRASE`, `BACKUP_S3_URI`, `BACKUP_KEEP_DAYS`; backup/restore procedure | reviewed |
| `frontend/src/app/globals.css` | Tablet breakpoint: top bar shrinks, avatar hidden, breadcrumb truncates, `min-width: 0` on main/content | sweep retest 0 overflow; browser suite 10/10 |
| `frontend/src/app/(workspace)/website/page.tsx` | Skip the API call and show a clear state when `organization.websiteEnabled` is false | typecheck + build clean; screenshot `erp-retest/admin--_website--tablet.png` |

## 4. Open issues with acceptance tests

| Issue | Acceptance test | Dependency / owner |
|---|---|---|
| C-04 legal content | Public legal pages show the registered company name and no "draft" banner; counsel sign-off recorded | business/legal |
| C-05 mobile release | Signed APK/AAB and iOS archive built from `scripts/build-school.sh` for the pilot school; installed on one Android and one iOS device; update gate opens the real store page | Play Console, Apple team |
| C-06 delivery providers | A new school completes sign-up and a guardian signs in with codes delivered by the real SMS/email providers on staging | provider contracts, ops |
| C-01 backup execution | First nightly backup exists off-host; `restore-drill.sh` output recorded; `DOCUMENT_ENCRYPTION_KEY` stored in the password manager | ops |
| SSLCommerz online fees | Sandbox checkout, IPN and return URL verified with store credentials before `onlineFeesEnabled` | merchant account |
| C-08 limiter | Decision recorded; limit keyed per contact or raised for known reseller IPs | product |

## 5. Release checklist

- Onboarding: `/start` sign-up with OTP, 14-day trial, setup checklist and student import verified; needs real code delivery (C-06).
- Support: platform console covers payment review, grants, suspension, website enablement and audit; `supportEmail` platform setting must be filled; help page exists in the workspace.
- Deployment: CI gates deploy; `release.sh` adds backup, health check and rollback. Set `DOCUMENT_ENCRYPTION_KEY`, `TRUST_PROXY`, providers, `BACKUP_PASSPHRASE`, real domain and `CORS_ORIGINS`; keep `PAYMENT_MODE=manual` until SSLCommerz is verified.
- Monitoring: `/api/health` checks DB and Redis, `/api/health/live` for liveness; add uptime alerts and error reporting (none configured); watch BullMQ failures and SMS credit balances.
- Data recovery: nightly backups plus restore drill (new scripts); Redis holds only queued jobs.
- Mobile: per-school build profile, signed artifacts, FCM project, `APP_STORE_URL`, privacy manifest review.

## 6. Verdict: **Ready for a controlled pilot** (not ready to sell)

Evidence: every core school journey (sign-up, setup, admission, attendance, fees, receipts, guardian access, subscription billing) is verified end to end with strict tenant isolation and role boundaries, 39 integration and 10 browser tests pass, and the visual sweep is clean after the tablet fix. The pilot scope: 2–3 invited schools on the web app with manual fee recording and manual subscription review, English/Bangla web, no online fees, no store-distributed apps (sideloaded debug builds acceptable for staff testing only), with the backup cron and restore drill in place before the first real student record is loaded.

Conditions to move to "Ready to sell": C-04 legal sign-off and company name, C-05 signed store builds tested on devices, C-06 real SMS/email delivery verified on staging, backup/restore drill recorded on the production host, monitoring and alerting live, and a decision on C-08.
