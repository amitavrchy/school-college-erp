# API guide

Base: `/api`. Login accepts `{email,password}` at `POST /auth/login`, setting an HTTP-only cookie. Send `x-campus-id` for the selected campus. Roles are campus-specific. Integer `Minor` fields use paisa. Dates use `YYYY-MM-DD`, displayed in Asia/Dhaka.

| Area       | Routes                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth       | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/password`                                                                                                                                                 |
| Admin      | `GET/POST /campuses`, `GET /campuses/:id/sessions`, `POST /sessions`, `PATCH /sessions/:id`, `GET/POST /users`, `GET/POST /holidays`                                                                                           |
| Academics  | `GET/POST /classes`, `GET/POST /sections`, `GET/POST /subjects`, `GET /teachers`, `POST /assignments`, `GET/POST /timetable`                                                                                                   |
| Students   | `GET/POST /students`, `GET /students/:id`, `POST /students/:id/guardians`                                                                                                                                                      |
| Admissions | `GET /admissions/options`, `GET/POST /admissions/applications`, `PATCH /admissions/applications/:id`, `POST /admissions/merit-lists/generate`, `POST /admissions/applications/:id/offer`, `POST /admissions/offers/:id/accept` |
| Files      | `GET/POST /admissions/applications/:id/documents`, `GET /admissions/documents/:id/download?token=...`                                                                                                                          |
| Attendance | `GET /attendance?date=YYYY-MM-DD&sectionId=...`, `POST /attendance/bulk`, `GET/POST /leaves`, `PATCH /leaves/:id`                                                                                                              |
| Fees       | `GET /fees/invoices`, `GET/POST /fees/structures`, `POST /fees/generate`, `GET/POST /fees/waivers`, `POST /fees/waivers/:id/approve`                                                                                           |
| Payments   | `GET /payments`, `GET /payments/config`, `POST /payments/intent`, `POST /payments/webhooks/sslcommerz`                                                                                                                         |
| Exams      | `GET/POST /exams/terms`, `PATCH /exams/terms/:id`, `GET/POST /exams/terms/:id/marks`, `POST /exams/terms/:id/publish`, `GET /exams/results/:studentId`                                                                         |
| PDFs       | `GET /students/:id/report-card`, `GET /payments/:id/receipt`                                                                                                                                                                   |
| Notices    | `GET/POST /notices`, `POST /notices/:id/schedule`, `GET /notices/sms`                                                                                                                                                          |
| Lifecycle  | `POST /lifecycle/promote`, `POST /lifecycle/transfer`                                                                                                                                                                          |
| Reports    | `GET /reports/dashboard`, `GET /reports/fee-collection`, `GET /reports/attendance-summary`, `GET /reports/audit`, `GET /guardians/me/dashboard`                                                                                |

Attendance: `{sectionId,date,period:0,records:[{enrollmentId,status:"PRESENT"}]}`. Period 0 means full day. Payment: `{studentId,amountMinor,provider:"MANUAL"|"SSLCOMMERZ",idempotencyKey:<UUID>}`. Marks: `{sectionId,subjectId,maxMarks:100,marks:[{enrollmentId,marksObtained,isAbsent:false}]}`.

Promotion: `{enrollmentIds,targetSectionId,carryDues:false}` advances one class into a writable new session. Transfer: `{enrollmentId,targetSectionId,effectiveDate}` requires administrative access to both campuses in the same organization.

Admission submission returns a 24-hour upload capability. Upload: `{token,fileName,mimeType,content:<base64>}`. Staff document listings return five-minute links. Offer acceptance requires the private acceptance token as `{token}`; an offer ID is insufficient.

## SaaS and advanced modules

Public: GET /saas/plans and POST /saas/register. Registration accepts organizationName, slug, campusName, planCode, period, fullName, email and a password of at least 12 characters. Public admissions options accept ?school=<organization-slug>; share /apply?school=<slug>.

Tenant owner: GET /saas/me, PATCH /saas/organization, POST /saas/payment-requests and GET /saas/payments/:id/receipt. Payment requests accept planId, period (MONTHLY/YEARLY), method (BKASH/NAGAD/BANK), reference and senderPhone. Successful submission remains PENDING.

Platform-only: GET /platform/dashboard, GET /platform/organizations/:id, POST /platform/payments/:id/review, POST /platform/organizations/:id/grant, PATCH /platform/organizations/:id, PATCH /platform/settings, PATCH /platform/plans/:id and GET /platform/audit. Review accepts decision, receivedAmountMinor and note. Grant requires planId, period, amountMinor, reason and a UUID idempotencyKey.

Advanced module base routes: /library/books, /library/loans, /library/reservations; /transport/routes, /transport/assignments, /transport/trips; /homework and /homework/:id/submit and /homework/submissions/:id/grade; /support/tickets and /support/tickets/:id/comments. Campus and role restrictions apply in addition to subscription feature gates. See controller validation schemas for exact mutation payloads.

GET /health is database/Redis readiness (503 when dependencies fail). GET /health/live is liveness. Error responses use appropriate 4xx/5xx codes; transient connection-pool exhaustion returns 503 with Retry-After.

## School websites

Authenticated administrators/principals use GET/POST /website, PATCH /website/draft, POST /website/publish, /website/unpublish, /website/preview and /website/restore. Draft save, publish and restore require the current numeric revision; conflicting editor versions return 409. Media: POST /website/assets, DELETE /website/assets/:id. Domains: POST /website/domains, POST /website/domains/:id/verify and DELETE /website/domains/:id. Enquiry inbox: GET /website/inquiries and PATCH /website/inquiries/:id.

Public routes live under /public-websites: GET /resolve?host=HOST, /tls-authorization?domain=HOST, /media/:id and /:subdomain. Result options: GET /:subdomain/results/options. Lookup: POST /:subdomain/results with termId, sectionId, rollNumber and (by default) dob in YYYY-MM-DD format. It returns a minimal published result and signed five-minute PDF URL. Contact: POST /:subdomain/inquiries with name, email, optional phone, message and optional honeypot website.

See the [complete CMS checklist and hosting contract](SCHOOL-WEBSITES.md).
