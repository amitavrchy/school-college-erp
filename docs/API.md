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
