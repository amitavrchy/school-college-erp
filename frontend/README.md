# Campus One frontend

Next.js 16 / React 19 application: public marketing and signup, institution workspace, guardian/student portal and global platform console.

Run `npm ci`, then `npm run dev` after starting the backend. Default URL: http://localhost:3000. Requests under `/api` proxy to http://localhost:4000. Set `API_INTERNAL_URL` **before building** for a different destination.

Checks: `npm run typecheck`, `npm run build`, `npm run format:check` and `npm run test:e2e`. Browser tests require Chrome and a seeded dedicated backend. Combined release verification: `node ../backend/setup/verify.mjs --integration`.

See [installation, accounts and production setup](../backend/README.md).

School website CMS: /website. Public schools: /school/SUBDOMAIN or the school's configured host. See the [feature checklist and DNS/HTTPS guide](../backend/docs/SCHOOL-WEBSITES.md). The browser suite covers CMS publishing, private previews, results/PDFs, enquiries and local subdomain routing.
