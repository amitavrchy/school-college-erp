# Campus One — School & College ERP

Multi-tenant SaaS for Bangladesh institutions. Next.js 16 / React 19, NestJS 11, Prisma 6, PostgreSQL 17 and Redis/BullMQ. All source and configuration live inside frontend and backend.

## Complete Docker setup

Requires Node.js 22+ and Docker Desktop's Linux engine. From the repository root:

```sh
npm --prefix backend ci
npm --prefix frontend ci
cd backend
npm run setup
cd ..
docker compose --env-file backend/.env -f backend/compose.yaml up --build -d --wait
docker compose --env-file backend/.env -f backend/compose.yaml exec -T api npm run db:seed
```

Open http://localhost:3000. API readiness: http://localhost:4000/api/health (checks database and Redis); liveness: /api/health/live. Database/Redis host ports: 55439/56439. Data persists in named volumes. API startup applies migrations. Seed only development or dedicated demo deployments.

## Local development

After installing dependencies and generating backend/.env:

```sh
docker compose --env-file backend/.env -f backend/compose.yaml up -d postgres redis --wait
npm --prefix backend run db:generate
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
npm --prefix backend run dev
```

In another terminal: `npm --prefix frontend run dev`. Stop Docker API/web if they occupy ports 4000/3000. Setup preserves existing environment files.

## Demo accounts

Seed: two campuses, classes 6–10, 200 learners and academic, financial, library, transport, homework and support examples.

| Role                      | Email                      |
| ------------------------- | -------------------------- |
| Platform owner            | platform@campusone.edu.bd  |
| Institution administrator | admin@campusone.edu.bd     |
| Principal                 | principal@campusone.edu.bd |
| Accounts                  | accounts@campusone.edu.bd  |
| Class teacher             | teacher@campusone.edu.bd   |
| Subject teacher           | hasan@campusone.edu.bd     |
| Admission officer         | admission@campusone.edu.bd |
| Guardian                  | guardian@campusone.edu.bd  |
| Student                   | student@campusone.edu.bd   |

Default demo password: `CampusOne!2026` (`SEED_PASSWORD`). Platform owner supports separate `PLATFORM_ADMIN_EMAIL` / `PLATFORM_SEED_PASSWORD`. Reseeding preserves existing passwords. Campus administrators cannot access the platform console.

## Implemented product

- Landing page with live plan prices, annual/monthly pricing, responsive navigation, feature previews, FAQ and institutional signup.
- Independent tenants and campus memberships; trials, plan feature gates, student/staff/campus quotas and expired-subscription read-only access.
- Platform console for institution status, payment review, idempotent manual activation, editable plans and receiving accounts. Tenant billing includes usage, history and PDF receipts.
- Manual bKash/Nagad/bank transaction-reference submission. Platform owner first configures receiving accounts, then verifies the actual transfer and approves the exact amount. Submission alone never activates a plan.
- Student/guardian records, academic sessions, classes, subjects, timetable conflicts, holidays, promotion and cross-campus transfers.
- School-specific admission links, merit/waitlists, capacity-safe offers and encrypted document uploads.
- Daily/period attendance, CSV import, leave and deduplicated absence alerts.
- Integer-paisa ledgers, recurring invoices, capped fines, FIFO payments, idempotency, dual-control waivers and optional SSLCommerz checkout.
- NCTB grading, moderation, published results, weighted terms and PDF report cards.
- Library inventory, concurrency-safe loans, reservations and invoice-backed overdue/lost-book charges.
- Transport routes/stops, capacity-safe assignments, boarding/drop-off records and fee invoices.
- Homework deadlines, private submissions, grading; support tickets with assignment, priority, SLA targets and comments.
- Targeted bilingual notices, background delivery, realtime updates, analytics, audit logs and guardian/student portals.
- Responsive UI, minimum 14px typography, reduced motion and automated accessibility regression checks.

## Release verification

```sh
node backend/setup/verify.mjs
```

With a seeded API/web running, append `--integration` for API acceptance and Chrome browser/accessibility tests. Install Chrome from frontend with `npx playwright install chrome` if needed. Test only dedicated test/demo environments: tenant fixtures are cleaned up, but browser workflows also save demo attendance and a BDT 1 payment.

`backend/automation/workflows/ci.yml` is a CI template, not an automatically discovered GitHub workflow. The two-directory root constraint keeps it here; run the verifier locally or through an externally configured runner.

## Deployment boundaries

For a fresh production database, set `PLATFORM_ADMIN_EMAIL` and a unique `PLATFORM_SEED_PASSWORD` of at least 16 characters, start the stack, then run `docker compose --env-file backend/.env -f backend/compose.yaml exec -T api npm run platform:bootstrap`. This initializes plans and the platform owner without demo tenants/students. Repeating it preserves existing passwords and edited prices. Create institutions through signup.

Use HTTPS, unique production secrets/passwords, backed-up encryption keys and tested database restores before public release. SMS defaults to simulated delivery. Live SSLCommerz/SMS requires credentials and provider verification. Wallet transaction references use manual review, not direct bKash/Nagad APIs. Payroll, video LMS, S3, automated refunds and bank reconciliation are outside this release.

Read [operations](docs/OPERATIONS.md), [API](docs/API.md), [environment settings](.env.example) and [original specification](Project_spec.md).
