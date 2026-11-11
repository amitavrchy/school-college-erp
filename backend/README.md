# Campus One — School & College ERP

Bangladesh-focused multi-campus ERP with a staff workspace, public admission form and guardian/student portal. Built with Next.js 16, React 19, NestJS 11, Prisma 6, PostgreSQL 17, Redis, BullMQ and Socket.IO.

## Start locally

Requires Node.js 22+ and Docker Desktop with its Linux engine running.

```sh
npm ci
npm run setup
docker compose up -d postgres redis --wait
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:3000**. API health: http://localhost:4000/api/health. Local database port: **55439**. Redis: **56439**. `setup` preserves an existing `.env`; environment files are ignored by Git.

## Complete Docker stack

```sh
npm run setup
docker compose up --build -d --wait
docker compose exec api npm run db:seed
```

The API migrates automatically on startup. Named volumes preserve data. Seed only development or dedicated demo deployments.

## Demo accounts

Seed: **2 campuses, classes 6–10, 200 students**, attendance, marks, fees, payments, admissions and bilingual notices. Password: `SEED_PASSWORD` in `.env` (example: `CampusOne!2026`). Existing accounts are preserved on reseeding; changing that variable does not reset them.

| Role              | Email                      |
| ----------------- | -------------------------- |
| Super admin       | admin@campusone.edu.bd     |
| Principal         | principal@campusone.edu.bd |
| Accounts          | accounts@campusone.edu.bd  |
| Class teacher     | teacher@campusone.edu.bd   |
| Subject teacher   | hasan@campusone.edu.bd     |
| Admission officer | admission@campusone.edu.bd |
| Guardian          | guardian@campusone.edu.bd  |
| Student           | student@campusone.edu.bd   |

The guardian has two linked learners per campus. The student account belongs to the first Dhanmondi student. Provision new accounts in Settings.

## Features

- Cookie authentication, password rotation, campus roles, teacher assignments and guardian/student isolation.
- Campuses, sessions, classes, sections, shifts, subjects, timetable conflicts and holidays.
- Admission review, weighted merit lists, waitlists, expiring private offers, concurrent capacity enforcement and enrollment.
- AES-256-GCM document uploads with signed expiring downloads.
- Daily/period attendance, CSV import/templates, leave requests and deduplicated absence alerts after a grace period.
- Monthly/quarterly/one-time fees, integer-paisa ledgers, capped fines, partial FIFO payments, idempotency and dual-control head-specific waivers.
- Automated monthly billing, configurable sibling tuition discounts and optional due reminders.
- SSLCommerz checkout with server-side amount/currency validation and staff cash/bank recording.
- NCTB GPA/percentage, weighted terms, entry deadlines, Principal unlocking, moderation, publication and PDF reports/receipts.
- Targeted English/Bangla notices, scheduled delivery, SMS logs and realtime refresh.
- Promotion with dues handling, cross-campus transfer API, analytics, audit logs and CSV exports.
- Responsive layout, minimum **14px** text, keyboard access, native dialogs, reduced motion and loading/error/empty states.

## Verify

```sh
npm test
npm run typecheck
npm run build
npm run format:check
npm audit
```

With the seeded API/web running, run `npm run test:integration` and `npm run test:e2e`. Browser tests use Google Chrome; install with `npx playwright install chrome` if needed. Integration fixtures are isolated and removed after the run.

## Integration status

Real payments require merchant credentials and public HTTPS callbacks. Real SMS requires a gateway adapter. Defaults are manual payment and **simulated SMS**, which never reaches a phone. SSLCommerz is the online gateway; direct bKash/Nagad adapters are not implemented. Documents use encrypted PostgreSQL storage rather than S3. Promotion/PDFs are synchronous; PDFs are uncached. Vendor-specific biometric imports need mapping to the supplied CSV. Grade scales are seeded in the database with NCTB fallback. Library/transport, payroll and video LMS remain outside the implemented core.

Read the [operations guide](docs/OPERATIONS.md), [API guide](docs/API.md), [.env.example](.env.example) and [original specification](Project_spec.md) for setup and advanced integration boundaries.
