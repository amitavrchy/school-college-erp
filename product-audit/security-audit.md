# School & College ERP — Security Audit

Static review at commit `2e11d6a`. No penetration test was run.

## 1. Supply-chain compromise

Same incident as the other repositories (tip `cb93e01` amended on 2026-11-13; cleaned by `2e11d6a`). See `../event-wedding-management/security-audit.md` §1 for the description and required actions. Specific to this repository:

- `backend/Dockerfile` runs `npm run db:generate && npm run build` and `frontend/Dockerfile` runs `npm run build`; at the malicious commit both `build` scripts started with `node init &&`.
- The runtime image copies `src/`, `setup/` and full `node_modules` (including dev dependencies) — a larger attack surface than the other two images.
- Whether the deploy workflow ran on the malicious commit is **REQUIRES FURTHER VERIFICATION**. This product stores minors' personal data; if production data existed at that time, treat it as a potential personal-data incident.
- Root `.gitignore` remnant still tracked.

## 2. Findings

| ID | Severity | Class | Finding | Evidence |
|---|---|---|---|---|
| R-S1 | High | CONFIRMED BUG | `trust proxy` is never configured, so behind Nginx and the Next.js rewrite every request appears to come from the proxy. Consequences: the 10/hour sign-up limit and the 20/minute admission-application limit are platform-wide; anonymous requests share one 300/min bucket; `express-rate-limit` uses the default in-memory store | `backend/src/main.ts:25-65`; no `trust proxy` anywhere in `backend/src` |
| R-S2 | High | CONFIRMED ARCHITECTURAL WEAKNESS | One SSLCommerz merchant account for all schools' fee payments; no settlement ledger. Customer email and phone sent to the gateway are placeholders (`accounts@example.invalid`, `01700000000`) | `modules/payments.ts:80-100` |
| R-S5 | Medium | CONFIRMED SECURITY ISSUE | Sign-up needs no email or phone verification and logs the user in immediately; any account can create unlimited additional organisations, each with a new 14-day trial; organisation slugs can be squatted | `saas/controllers.ts:48-77`, `saas/service.ts:28-99` |
| R-S6 | Medium | POTENTIAL RISK | Upload and download tokens are signed with the same secret, issuer and audience as session tokens. They cannot be used as sessions today (subject is not a user ID; purpose is checked), but there is no cryptographic separation. The document encryption key silently falls back to a key derived from the JWT secret when `DOCUMENT_ENCRYPTION_KEY` is unset | `modules/uploads.ts:27-42`, `modules/admissions.ts:76-79` |
| R-S7 | Medium | CONFIRMED SECURITY ISSUE | No Content-Security-Policy, frame or HSTS headers from the Next.js app, which also renders tenant-authored website content | `frontend/next.config.ts` |
| R-S10 | Medium | CONFIRMED SECURITY ISSUE | No multi-factor authentication, including for the platform administrator and school super admins; no self-service password reset; staff accounts cannot be deactivated or have roles changed through the API (`users` has list and create only) | `auth/auth.controller.ts`, `modules/users.ts` |
| R-S8 | Medium | CONFIRMED ARCHITECTURAL WEAKNESS | Personal documents and website media are stored as `bytea` in the main database with an 8 MB JSON body limit and base64 transport | `main.ts:15`, `modules/uploads.ts:43-98`, schema |
| R-S9 | Low | CONFIRMED BUG | `Audit.log` is written after and outside the business transaction in several modules, so an audit entry can be lost on failure between the two writes | `audit.ts`, `modules/users.ts:57`, `students.ts:104`, `fees.ts:78` |
| R-S11 | Low | POTENTIAL RISK | Logout increments `tokenVersion`, signing the user out on every device; acceptable, but there is no per-device session list | `auth.controller.ts:77-85` |
| R-S12 | Low | CONFIRMED SECURITY ISSUE | Public admission form has no CAPTCHA; with the shared limiter fixed, each IP may still create 20 applications per minute | `main.ts:62-65`, `modules/admissions.ts:51-82` |
| R-S13 | Medium | CONFIRMED ARCHITECTURAL WEAKNESS | Shared EC2 host, Postgres and Redis with the other two products | `deploy/.env.example` |
| R-S14 | Low | REQUIRES FURTHER VERIFICATION | Public result lookup and website inquiry endpoints (`websites/results.ts`, `websites/controllers.ts`) were not reviewed in detail; they are rate-limited through Redis (`Jobs.publicLimit`) | — |

## 3. Controls in place (keep)

- Global guard; roles, platform-only, billing and feature decorators; role data loaded from the database on each request; `tokenVersion` revocation on logout and password change.
- Login compares against a dummy hash when the user does not exist (`auth.controller.ts:38-41`), limiting timing-based enumeration; login limiter keyed by IP + email.
- Origin allowlist for state-changing requests with explicit exceptions for gateway callbacks (`main.ts:66-77`); cookie `SameSite=Lax`, `httpOnly`, `Secure` in production.
- SSLCommerz callbacks are not trusted: the server calls the gateway validation API and checks status, currency, amount and transaction ID before settling; settlement is idempotent (`modules/payments.ts:133-162`, `payment.service.ts:35-87`).
- Admission documents: type allowlist, magic-byte check, 5 MB cap, five per application, AES-256-GCM at rest, 5-minute signed download links.
- Maker-checker on fee waivers with a principal threshold (`modules/fees.ts:117-168`).
- Subscription payments: unique `(method, reference)`, exact-amount confirmation, idempotent activation and grants, event log.
- zod validation everywhere; parameterised SQL; `npm audit` reports 0 vulnerabilities (executed); unit tests in `test/security.test.ts` pass (executed).

## 4. Controls not present

MFA; password reset; account lockout beyond rate limiting; staff deactivation; session/device management; CSP; CAPTCHA on public forms; antivirus scanning of uploads; consent and privacy-notice capture for minors' data; retention policy; backup encryption and restore procedure in the repository; active CI with dependency scanning.

## 5. Privacy considerations for minors' data

The system holds children's names, dates of birth, guardians' phone numbers, attendance, results, fee history and uploaded identity documents. Before launch: publish a privacy notice; record consent at admission; restrict platform-staff access and log it; define retention (for example, delete admission documents of rejected applicants after a fixed period); make sure SMS content does not expose results or dues beyond the guardian; confirm applicable Bangladeshi data-protection requirements with a lawyer — the current legal position was **not verified** in this audit.

## 6. Remediation order

1. Incident response (shared).
2. R-S1: `app.set("trust proxy", …)` from env; Redis store for `express-rate-limit`; per-IP and per-organisation keys.
3. R-S2: keep `PAYMENT_MODE=manual`; design per-organisation gateway configuration or a settlement ledger before enabling online fees; send real guardian contact details.
4. R-S10: staff deactivation/role change; password reset; MFA (TOTP) for platform admin and school admins.
5. R-S5: verification (phone OTP or email) before trial activation; one trial per verified phone and per organisation name similarity check; manual approval option.
6. R-S6: separate secrets (or distinct audiences) for purpose tokens; fail startup in production when `DOCUMENT_ENCRYPTION_KEY` is missing.
7. R-S7, R-S12: CSP/HSTS; CAPTCHA or proof-of-work on public forms.
8. R-S8: private object storage with per-tenant prefixes.
9. R-S9: audit writes inside the same transaction.

## 7. Verification steps

- With `TRUST_PROXY` set, two clients from different IPs have independent admission and sign-up limits (inspect `RateLimit` headers).
- A deactivated teacher's next request returns 401.
- Unverified sign-ups cannot reach the workspace; a second trial for the same phone is refused.
- Starting the API in production without `DOCUMENT_ENCRYPTION_KEY` fails fast.
- `curl -I` on the frontend shows CSP and HSTS headers.
