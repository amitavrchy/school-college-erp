# School websites

Open **School website** in the staff workspace. Administrators and principals can manage one website for their institution, including all campuses.

## Implemented checklist

- Academy, Modern and Classic themes; school name, logo, colours, campus imagery, contact information and principal message.
- Up to 20 pages, navigation visibility, SEO descriptions and editable slugs.
- Hero, text, features, image and call-to-action blocks; reorder pages and blocks.
- Separate draft/live snapshots, private preview, edit-conflict detection, publication history, restore-as-draft and unpublish.
- Public JPEG/PNG/WebP/PDF library: 5 MB per file, 100 files and 100 MB total. Uploaded files are public immediately; private admission documents stay in their existing encrypted system.
- Faculty directory, photo gallery and download centre.
- Public news, notices and events, keyword search, pins, scheduled publication, expiry, attachments and event dates. Private ERP notices are not exposed.
- Admissions information linked to the institution's application form.
- Published ERP result lookup by exam/session/campus, section and enrollment roll number.
- Date-of-birth verification by default; roll-only mode requires explicit school consent. Duplicate rolls are not guessed.
- Subject marks, grades, GPA/pass status and signed five-minute PDF downloads. No birth date, guardian contact or private student fields in results.
- Contact form, honeypot, Redis submission limits, enquiry inbox, office notes and read/resolved states.
- Managed school subdomains, custom-domain claims, TXT ownership/CNAME routing checks, proof-based domain transfer and disconnect.
- Host-based routing isolated from ERP/account routes, SEO/canonical metadata, sitemap, robots rules and RSS.
- Publication/domain audit events. Expired subscriptions block editing; published sites stay readable. Suspended institutions are hidden.

## Local use

Create a website at /website, edit it, **Save draft**, then **Publish saved draft**. The public fallback is /school/SUBDOMAIN and the managed host is http://SUBDOMAIN.localhost:3000. Chrome resolves localhost subdomains locally.

Public modules: /results, /admissions, /notices, /news, /events, /faculty, /gallery, /downloads and /contact. They also work beneath the fallback school path. The result roll is Enrollment.rollNumber, not a global student ID. Staff must maintain unique section/session rolls and student birth dates for the default lookup policy.

## Production DNS and HTTPS

Set these values in backend/.env:

```dotenv
APP_URL=https://app.yourplatform.com
CORS_ORIGINS=https://app.yourplatform.com
COOKIE_SECURE=true
PLATFORM_DOMAIN=app.yourplatform.com
SCHOOL_SITE_BASE_DOMAIN=schools.yourplatform.com
SCHOOL_SITE_CNAME_TARGET=sites.yourplatform.com
```

Point app.yourplatform.com, sites.yourplatform.com and *.schools.yourplatform.com to the server. From the repository root:

```sh
docker compose --env-file backend/.env -f backend/compose.yaml --profile edge up --build -d --wait
```

For a school domain such as www.customer-school.edu.bd, the CMS provides a TXT record at _campusone.www.customer-school.edu.bd with its ownership token, plus a CNAME pointing to the platform routing target. Add both at the registrar, verify DNS in the CMS, and publish the site.

Use www or another subdomain with an actual CNAME. Apex ALIAS/ANAME flattening is provider-specific and not supported by this verifier. Hostnames are exact; www and bare domains are separate claims.

The optional Caddy gateway issues certificates only for active, published hosts approved by /api/public-websites/tls-authorization. DNS verification and certificate issuance are separate steps. Public DNS, ports 80/443 and ACME connectivity must work; preserve Caddy's data volumes. See [Caddy on-demand TLS](https://caddyserver.com/docs/automatic-https#on-demand-tls).

Session cookies remain host-only. School hosts cannot serve the ERP or account APIs; guardian login links to the central platform.

No registrar credentials or school domain were supplied. Domain-proof logic, local host routing and gateway configuration can be verified here; actual public DNS and live certificate issuance require the deployment's real domains.

## Publication responsibility

Schools must have permission to publish their photographs/documents and public examination results. Keep the default birth-date check unless roll-only publication is authorized. Result pages/PDFs are not indexed or cached. Private preview links expire after 15 minutes.
