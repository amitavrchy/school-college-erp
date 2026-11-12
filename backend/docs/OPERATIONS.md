# Operations

## Deploy

All compose commands below run from backend, using `docker compose --env-file .env -f compose.yaml`. From the root use `--env-file backend/.env -f backend/compose.yaml` instead.

Use HTTPS, APP_URL and CORS_ORIGINS matching the public origin, COOKIE_SECURE=true, a random JWT_ACCESS_SECRET and private database credentials. Set POSTGRES_PASSWORD before initializing PostgreSQL; rotating it later also requires changing the database role password. Local HTTP defaults COOKIE_SECURE=false. Ports bind localhost; WEB_BIND/WEB_PORT configure the web listener. Put an HTTPS reverse proxy in front for public access.

Next.js proxies API requests and authenticated Socket.IO polling. API_INTERNAL_URL is embedded at build time; rebuild to change it. Docker builds target http://api:4000. The API runs as a non-root user and applies migrations on startup. Readiness /api/health checks both PostgreSQL and Redis; /api/health/live is process liveness.

Never seed real production with demo data. On a dedicated demo, change every seeded credential before public access. Keep environment files and database dumps private. Grant platform access only to trusted operators; a campus SUPER_ADMIN is not a platform owner.

## SaaS subscriptions

Landing prices are read from active plans. Signup provisions an isolated institution, campus, owner and a 14-day trial. Plan quotas and feature gates are checked by the API, including concurrent admissions/provisioning. Student limits count stored student records, including archived records; staff limits count distinct users with staff roles across the institution. Transfers create a destination student record and consume capacity.

At /platform configure the bKash/Nagad receiving number or bank instructions. The institution owner submits a transaction reference from /subscription. Verify the actual transfer in the merchant account before approval; entered reference strings alone are not proof of payment. Approval requires the exact received amount, records the reviewer/note, and activates the purchased period once. Duplicate method/reference pairs are rejected. Manual activation also requires a reason and an idempotency key. Approved receipts are downloadable. Plan/settings edits are recorded in GET /api/platform/audit; institution events are available in the organization detail.

Expired subscriptions permit core read access and billing renewal, but block new operational writes and paid modules. Suspended institutions cannot perform operational writes. Plan changes cannot activate when existing usage exceeds the new limits. Month-end renewal dates are clamped to the target month's last day.

## Student fees and SMS

PAYMENT_MODE=manual permits finance staff to record bank/cash. Guardians cannot simulate payments. SSLCommerz checkout requires PAYMENT_MODE=sslcommerz, store credentials and SSLCOMMERZ_SANDBOX=true for sandbox. Live mode needs a live merchant account. IPN: /api/payments/webhooks/sslcommerz; browser return: /api/payments/return. Server validation checks transaction, amount and currency; redirects alone cannot settle invoices. Money is integer paisa (100 = BDT 1). Conflicting late gateway payments remain pending for staff reconciliation.

SMS_PROVIDER=console records SIMULATED messages without sending. SMS_PROVIDER=http posts {to,body,sender} to SMS_API_URL with bearer SMS_API_KEY and an Idempotency-Key header. The adapter must return {id} and honor idempotency. Failures retry five times. Provider-specific delivery callbacks require integration. Absence alerts wait 30 minutes and recheck leave/current attendance; scheduled notices dispatch every minute. Configure provider quotas before sending at scale.

## Scheduled work

Maintenance accrues capped fines, expires offers and advances waitlists. Monthly fee invoices are due on day 10; generation keys prevent duplicates and manual generation recovers missed jobs. Fine defaults: FEE_FINE_PER_DAY_MINOR=1000, cap 50000 paisa. SIBLING_DISCOUNT_BPS=1000 means 10% tuition discount; default 0 disables it. FEE_REMINDERS_ENABLED is false for demos. Waivers require a different approver; above BDT 1000 requires Principal approval.

Promote/carry dues before closing sessions. Closed sessions are read-only. Activating a new session closes the previous active session. Background jobs use Redis persistence; monitor queue failures and simulated versus sent SMS counts.

## Keys, backups and restore

Uploads use AES-256-GCM. DOCUMENT_ENCRYPTION_KEY accepts a dedicated 64-character hex key. If empty it derives from JWT_ACCESS_SECRET: rotating JWT then makes existing documents unreadable. Back up the actual key securely and plan re-encryption before changing it. Upload limits: five documents/application, 5 MB each; download links expire after five minutes.

Back up PostgreSQL and keys, test restoration to a separate database and preserve Redis append-only data. From backend, `docker compose --env-file .env -f compose.yaml exec -T postgres pg_dump -U campus campus_one` emits a backup. Store it securely outside the repository; verify record counts and encrypted-document downloads after restore, then reconcile queued jobs. Do not delete volumes to deploy updates.

## External boundaries

Live merchant/SMS delivery and deployment-specific load/restore testing require operator credentials and infrastructure. Direct bKash/Nagad APIs, vendor biometric mapping, S3, handset delivery callbacks, configurable admission quota policies, asynchronous/cached PDFs, refunds, bank reconciliation, payroll and video LMS are outside this release. Existing library/transport/homework/support flows are implemented and covered by API tests. Automated accessibility checks cover selected public/workspace routes; they do not replace a complete manual accessibility audit.
