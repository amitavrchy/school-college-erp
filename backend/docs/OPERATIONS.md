# Operations

## Production

Use HTTPS and set `APP_URL`, `CORS_ORIGINS`, `COOKIE_SECURE=true`, a random `JWT_ACCESS_SECRET` and private database credentials. Local HTTP Docker explicitly uses `COOKIE_SECURE=false`. Set `POSTGRES_PASSWORD` before initializing PostgreSQL; changing it later also requires rotating the database role password. Next.js proxies API and authenticated Socket.IO polling. Set `API_INTERNAL_URL` at build time for a different backend. Docker targets `http://api:4000`.

## Payments

`PAYMENT_MODE=manual` permits finance staff to record bank/cash. Guardians cannot simulate payments. For sandbox checkout set `PAYMENT_MODE=sslcommerz`, merchant credentials and `SSLCOMMERZ_SANDBOX=true`. Use `false` only with a live merchant account. IPN: `/api/payments/webhooks/sslcommerz`; browser return: `/api/payments/return`. Server-to-server validation checks status, transaction, amount and currency. A redirect cannot mark an invoice paid. Money uses integer paisa; 100 paisa = BDT 1.

If a provider payment arrives after another payment or waiver exhausts the balance, allocation is blocked for staff reconciliation and remains pending. Automatic refunds and bank statement imports are outside this implementation.

## SMS

`SMS_PROVIDER=console` records `SIMULATED` messages without sending. `SMS_PROVIDER=http` posts `{to,body,sender}` to `SMS_API_URL`, with bearer `SMS_API_KEY` and an `Idempotency-Key` header. The gateway must return `{id}` and honor idempotency. Adapt this contract to the selected Bangladesh provider. Failures retry five times with exponential backoff. Current logs distinguish queued, failed, sent and simulated; handset-delivery callbacks require provider-specific integration.

Absence alerts wait 30 minutes, recheck approved leave and current attendance, and deduplicate by student/day. Notices dispatch every minute. Bangla uses UCS-2 limits. Set provider quotas before sending at scale.

## Billing and sessions

Maintenance accrues capped fines, expires offers and promotes the next waitlisted applicant. On each month’s first day, it generates invoices due on day 10. Generation keys prevent duplicates per structure/student/month. Manual generation recovers a missed job. Fine defaults: `FEE_FINE_PER_DAY_MINOR=1000`, cap 50000 paisa.

`SIBLING_DISCOUNT_BPS` applies tuition discounts to students sharing a primary guardian; `1000` means 10%, default `0` disables it. Waivers apply to a selected invoice head and require a different approver; above BDT 1000 requires the Principal role. `FEE_REMINDERS_ENABLED=true` enables T-3/T-0 reminders; keep disabled for demos.

Promote and carry forward dues before closing a session. Closed sessions are read-only. Activating a new session closes the previous active session.

## Documents and backups

Uploads use AES-256-GCM. Set `DOCUMENT_ENCRYPTION_KEY` to 64 random hex characters for a dedicated key. Otherwise it derives from `JWT_ACCESS_SECRET`; rotating that secret makes old documents unreadable. Back up keys securely and plan re-encryption before rotation. Limits: five documents/application, 5 MB each, five-minute download links.

Back up PostgreSQL, test restores and preserve Redis append-only persistence. Reconcile queued jobs after restoring. `docker compose exec -T postgres pg_dump -U campus campus_one` emits a backup; direct it to secure storage. Never commit dumps, uploads or credentials.

## Advanced boundaries

Library/transport, direct wallets, vendor biometric drivers, S3, gateway delivery callbacks, configurable admission quota policies, asynchronous/cached PDFs, fee-cap settings UI, refunds and bank reconciliation need additional implementation. Transfer is available from the student profile: it preserves the original record, links the family at the destination, and prorates monthly fees. Promotion lets staff hold selected learners and choose a later session without entering record IDs. These external integrations are not represented as live.
