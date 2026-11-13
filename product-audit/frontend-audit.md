# School & College ERP — Frontend Engineering Audit

Static review of `frontend/` at commit `2e11d6a`; not rendered in a browser (runtime and visual behaviour NOT VERIFIED). Executed: `tsc --noEmit` PASS. Files read: `lib/api.ts`, `lib/use-data.ts`, `proxy.ts`, `next.config.ts`, navigation definition in `components/shell.tsx`, greps over all pages. Pages were not read line by line.

## 1. Structure

| Surface | Routes |
|---|---|
| Marketing | `/` (`components/landing.tsx`, 710 lines) |
| Tenant sign-up | `/start` |
| Sign-in | `/login` |
| Public admission | `/apply` |
| ERP workspace | `(workspace)`: overview, students (+ detail), admissions, attendance, academics, exams, fees, guardian, notices, homework, library, transport, support, subscription, reports, settings, website (CMS editor), help |
| Platform console | `/platform` (540 lines) |
| Tenant school websites | `/school/[slug]/[[...path]]` with `feed.xml`, `robots.txt`, `sitemap.xml`; reached through `src/proxy.ts` by subdomain or verified custom domain |

All workspace pages are client components using `useData` and the `api`/`post` helpers; same-origin `/api/*` is rewritten to the API, including the Socket.IO path (`next.config.ts`).

## 2. Session and tenant selection

| Finding | Evidence | Class |
|---|---|---|
| Cookie session; nothing sensitive in JavaScript storage | `lib/api.ts:12-20` | Good |
| Active campus and session IDs kept in `localStorage` and sent as `x-campus-id`; the server validates the campus against the user's roles | `lib/api.ts:11`, `:17`; `components/shell.tsx:172`, `:191-192`; `settings/page.tsx:275` | Good; stale values are corrected in the shell |
| School-site hosts cannot reach ERP pages or non-public API paths | `proxy.ts:18-24` | Good |
| Host header is used to resolve the tenant site through `public-websites/resolve` on every request with `cache: "no-store"` | `proxy.ts:32-36` | POTENTIAL RISK: one extra API call per page view on school sites; add a short cache |
| No security headers configured | `next.config.ts` | CONFIRMED (R-S7) |

## 3. Data fetching and realtime

- `useData` (`lib/use-data.ts`) fetches on mount, guards against out-of-order responses, and refetches on a window event `campus-refresh`.
- The shell opens one Socket.IO connection and turns **every** server `refresh` event into `campus-refresh` (`components/shell.tsx:213-221`), so all mounted hooks refetch whenever anything changes on the campus (attendance, payment, notice).

**R-F1 — CONFIRMED ARCHITECTURAL WEAKNESS:** the server already sends an event name (`{event}` in `realtime.ts:48-53`); the client ignores it. During morning attendance, every open staff screen refetches its data once per saved section. Filter by event type.

- Responses are untyped (`api<T = any>`).
- No client cache/deduplication library; acceptable at this size.

## 4. Navigation

`components/shell.tsx` defines 17 items grouped (for example `MANAGEMENT`) with per-item role lists; guardians and students get "My family", exams, fees, homework, library, transport, notices and help. A Playwright test asserts that a guardian sees no staff navigation (`e2e/workflows.spec.ts:51`). Feature-gated modules use `components/module-gate.tsx`.

Observations:

- Notices, Help & requests and Settings have empty role lists (visible to all) — intended.
- "Subscription" is limited to `SUPER_ADMIN`, while the API allows organisation `OWNER`/`ADMIN` members (`saas/service.ts:18-27`); the two concepts can diverge — REQUIRES FURTHER VERIFICATION.
- The platform console is a separate route outside the workspace shell.

## 5. Component size

| File | Lines |
|---|---:|
| `app/(workspace)/website/page.tsx` | 1,398 |
| `components/school-website.tsx` | 751 |
| `components/landing.tsx` | 710 |
| `app/platform/page.tsx` | 540 |
| `app/(workspace)/fees/page.tsx` | 466 |
| `components/shell.tsx` | 411 |

**R-F2 — CONFIRMED ARCHITECTURAL WEAKNESS:** the website editor is a single 1,400-line client component; it should be split into editor state, block editors and preview. The CMS is also the least essential surface for a first ERP launch.

## 6. Forms, states, accessibility

- `components/ui.tsx` (400 lines) provides shared form, table and dialog primitives.
- `@axe-core/playwright` is a dev dependency and `e2e/accessibility.spec.ts` runs automated checks on public pages and "advanced workspaces"; `workflows.spec.ts:63` checks mobile navigation and minimum font size. These were NOT RUN in this audit.
- No `confirm(` usage and no `dangerouslySetInnerHTML` found by grep. Tenant website content is rendered through React components (`components/school-website.tsx`), which avoids raw HTML injection.
- `lang="en"` on the root; Bangla appears only as an optional notice body with `lang="bn"` (`notices/page.tsx:63-65`).
- CSV export escapes formula prefixes (`lib/api.ts:51-56`).

## 7. Frontend ↔ backend gaps

| UI area | Gap (backend) |
|---|---|
| Students | Add one at a time; no edit; no bulk import |
| Settings → users | Create only; no deactivate or role change |
| Fees | Online payment button depends on `payments/config`; in the default `manual` mode guardians cannot pay online |
| Guardian portal | Requires an administrator-created account with email and 12-character password |
| Subscription | Manual reference submission and receipt download; no cancel/downgrade |
| Academics → timetable | Upsert only; no delete |
| Report card / receipt downloads | English-only PDFs with platform branding on receipts |

## 8. Performance notes

- Four global stylesheets (≈ 5,000 lines) — check that `landing.css`, `school-website.css` and `website-editor.css` are imported only by their routes (NOT VERIFIED).
- School-site pages make a server-side resolve call per request (see §2).
- Bundle sizes were not measured (no production build was run).

## 9. Recommendations

1. Event-scoped refresh: dispatch `campus-refresh:<event>` and let hooks subscribe to the events they depend on.
2. Security headers and CSP (allow the Socket.IO path and tenant media URLs).
3. Bangla UI with a language switch; Bangla-capable PDFs.
4. Bulk student import with a template and row-level errors; inline student editing.
5. Staff management: deactivate, change role, reset password, invite existing account.
6. Split the website editor; cache tenant-site host resolution for 60 s.
7. Type API responses (generate from zod schemas or OpenAPI).
8. Run the accessibility and mobile specs in CI on every pull request.
