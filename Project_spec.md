# School & College ERP — Project Spec

> Stack: **Next.js + NestJS + Prisma + PostgreSQL + Redis/BullMQ + Socket.IO**  
> Bangladesh-focused multi-campus school/college ERP: admission, attendance, results/grading, fee collection (bKash/Nagad/SSLCommerz/bank), guardian app, SMS notices.

---

## 1. Overview & Goals

### Product
A multi-campus academic ERP for Bangla-medium, English-medium, and college levels. Covers student lifecycle from admission → class allocation → attendance → exams/results → fees → alumni. Guardians get a mobile-first portal with SMS fallback (critical for BD parents without apps).

### Engineering goals
- Multi-campus / multi-session (e.g. 2025–26) tenancy with shared brand, isolated data scopes.
- Fee ledger with installments, late fines, waivers, and multi-gateway payments.
- Result engine supporting GPA/letter grades (NCTB-style) and percentage systems.
- Attendance with biometric/CSV import + real-time class marking.
- Notice blast: in-app + SMS (local BD gateway adapter) with delivery receipts.
- Strong RBAC (Principal, Accounts, Teacher, Guardian, Student, Campus Admin).

### Non-goals (v1)
- Full LMS video classrooms (link out / stub).
- Payroll for all staff (basic teacher attendance only; link to separate HR later).
- Government EMIS submission automation (export CSV templates only).

---

## 2. User Roles & Permissions (RBAC)

| Role | Scope | Key permissions |
|------|-------|-----------------|
| `SUPER_ADMIN` | Org | Campuses, global settings, feature flags |
| `CAMPUS_ADMIN` | Campus | Sessions, classes, users, reports |
| `PRINCIPAL` | Campus | Approvals (admission, waiver), analytics |
| `ACCOUNTS` | Campus | Fees, invoices, receipts, reconciliation |
| `TEACHER` | Assigned sections | Attendance, marks entry, homework notices |
| `CLASS_TEACHER` | Section | Roster, guardian contact, section notices |
| `ADMISSION_OFFICER` | Campus | Applications, merit lists, seat offers |
| `GUARDIAN` | Linked students | Fees, attendance, results, notices |
| `STUDENT` | Self | Timetable, results (if allowed), notices |

`UserCampusRole` + section assignments. Guardians can link multiple students.

---

## 3. Feature Modules

1. **Org & Campus** — campuses, academic sessions, shifts (morning/day), holidays calendar.
2. **Admission** — online application, documents, admission test scores, merit list, seat confirmation + admission fee.
3. **Academics** — class/section, subjects, teachers, timetable, student promotion/transfer.
4. **Attendance** — daily period/day attendance, leave requests, SMS on absent.
5. **Exams & Results** — exam terms, mark entry, moderation, GPA calculation, report cards PDF, publish control.
6. **Fees** — fee structures by class/session, invoices, partial pay, scholarships/waivers, reminders.
7. **Guardian / Student apps** — dashboards, pay fees, view results, notices.
8. **Notices & SMS** — targeted by campus/class/section/individual; templates in Bangla/English.
9. **Library / Transport (optional advanced)** — stub modules with schema hooks.
10. **Audit & Reports** — fee collection flash, attendance %, result analytics, admission funnel.

---

## 4. Advanced Business Logic

### 4.1 Multi-session & promotion
- Active `AcademicSession` per campus; historical data immutable after close.
- Promotion job: rules map class N → N+1; fail/hold list; generate new enrollments; carry dues flag.

### 4.2 Fee engine
```
For student enrollment:
  feeItems = FeeStructure(class, session, studentType) + optional (transport, hostel)
  generate Invoice schedule (monthly/quarterly/one-time)
On payment:
  allocate FIFO to oldest unpaid invoice lines
  apply lateFine = perDay * overdueDays capped by maxFine (campus config)
  scholarship waiver reduces specific heads only
```
Idempotent payments via `idempotencyKey`. Support siblings discount rule.

### 4.3 GPA / grading (NCTB-flexible)
- Grade scale table: marks range → letter → grade point.
- Subject GPA; fail if any compulsory subject fails (config).
- Final GPA = weighted term exams (e.g. mid 40% + final 60%) + continuous assessment.
- Publish: `DRAFT → MODERATION → PUBLISHED`; guardians see only PUBLISHED.

### 4.4 Attendance alerts
- Mark absent → enqueue SMS to primary guardian after grace (e.g. 30 min) unless leave approved.
- Deduplicate: one SMS per student per day for full-day absence.

### 4.5 Admission seat allocation
- Merit rank = w1*admissionTest + w2*previousGPA + quota flags (freedom fighter, sibling — document policy).
- Offer seats with expiry; waitlist auto-promote on decline/expire.
- Concurrent accept: lock seat counter `FOR UPDATE`.

### 4.6 Edge cases
- Student transfer between campuses mid-session: prorate fees; keep result history.
- Teacher marks entry lock after deadline; unlock requires Principal.
- Dual guardian conflicting contacts: primary/secondary channels.
- Bangla SMS length: UCS-2 segments; template char limits.
- Session rollover while unpaid dues exist: block promotion or carry forward with flag.

---

## 5. State Machines

**AdmissionApplication**: `DRAFT → SUBMITTED → UNDER_REVIEW → TEST_SCHEDULED → MERIT_LISTED → OFFERED → ACCEPTED → ENROLLED | REJECTED | WAITLISTED | EXPIRED`  
**Enrollment**: `ACTIVE → PROMOTED | TRANSFERRED | WITHDRAWN | ALUMNI`  
**Invoice**: `DUE → PARTIAL → PAID | WAIVED | CANCELLED`  
**ExamTerm**: `SETUP → ENTRY_OPEN → ENTRY_LOCKED → MODERATION → PUBLISHED`  
**LeaveRequest**: `REQUESTED → APPROVED | REJECTED`  
**Notice**: `DRAFT → SCHEDULED → SENDING → SENT`

---

## 6. Prisma Schema Draft

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model Organization { id String @id @default(cuid()) name String }
model Campus {
  id String @id @default(cuid())
  orgId String
  name String
  code String
  timezone String @default("Asia/Dhaka")
  address String?
  @@unique([orgId, code])
}
model AcademicSession {
  id String @id @default(cuid())
  campusId String
  name String // "2025-26"
  startsOn DateTime @db.Date
  endsOn DateTime @db.Date
  status String // PLANNED ACTIVE CLOSED
  @@unique([campusId, name])
}
model User {
  id String @id @default(cuid())
  email String? @unique
  phone String? @unique
  passwordHash String?
  fullName String
  fullNameBn String?
}
model UserCampusRole {
  id String @id @default(cuid())
  userId String
  campusId String
  role String
  @@unique([userId, campusId, role])
}
model GuardianStudent {
  guardianUserId String
  studentId String
  relation String
  isPrimary Boolean @default(false)
  @@id([guardianUserId, studentId])
}
model Student {
  id String @id @default(cuid())
  campusId String
  userId String? @unique
  studentCode String
  dob DateTime? @db.Date
  gender String?
  bloodGroup String?
  @@unique([campusId, studentCode])
}
model SchoolClass {
  id String @id @default(cuid())
  campusId String
  name String // "Class 8"
  numericLevel Int
}
model Section {
  id String @id @default(cuid())
  classId String
  sessionId String
  name String // "A"
  classTeacherId String?
  @@unique([classId, sessionId, name])
}
model Enrollment {
  id String @id @default(cuid())
  studentId String
  sectionId String
  sessionId String
  status String
  rollNumber String?
  @@unique([studentId, sessionId])
  @@index([sectionId])
}
model Subject {
  id String @id @default(cuid())
  campusId String
  name String
  code String
  @@unique([campusId, code])
}
model SectionSubjectTeacher {
  id String @id @default(cuid())
  sectionId String
  subjectId String
  teacherId String
  @@unique([sectionId, subjectId])
}
model AdmissionApplication {
  id String @id @default(cuid())
  campusId String
  sessionId String
  applyingClassId String
  status String
  applicantName String
  guardianPhone String
  scores Json?
  meritRank Int?
  offerExpiresAt DateTime?
}
model SeatOffer {
  id String @id @default(cuid())
  applicationId String @unique
  sectionId String?
  status String
}
model AttendanceRecord {
  id String @id @default(cuid())
  enrollmentId String
  date DateTime @db.Date
  status String // PRESENT ABSENT LATE LEAVE HOLIDAY
  period Int?
  markedBy String?
  @@unique([enrollmentId, date, period])
  @@index([date, status])
}
model LeaveRequest {
  id String @id @default(cuid())
  studentId String
  fromDate DateTime @db.Date
  toDate DateTime @db.Date
  status String
  reason String?
}
model ExamTerm {
  id String @id @default(cuid())
  sessionId String
  name String
  status String
  weightBps Int @default(10000)
}
model ExamMark {
  id String @id @default(cuid())
  termId String
  enrollmentId String
  subjectId String
  marksObtained Decimal? @db.Decimal(6,2)
  maxMarks Decimal @db.Decimal(6,2)
  gradeLetter String?
  gradePoint Decimal? @db.Decimal(3,2)
  isAbsent Boolean @default(false)
  @@unique([termId, enrollmentId, subjectId])
}
model GradeScale {
  id String @id @default(cuid())
  campusId String
  minMarks Decimal @db.Decimal(6,2)
  maxMarks Decimal @db.Decimal(6,2)
  letter String
  point Decimal @db.Decimal(3,2)
}
model FeeStructure {
  id String @id @default(cuid())
  sessionId String
  classId String
  name String
}
model FeeHead {
  id String @id @default(cuid())
  structureId String
  name String // Tuition, Lab, Exam
  amountMinor Int
  frequency String // MONTHLY QUARTERLY ONCE
}
model Invoice {
  id String @id @default(cuid())
  studentId String
  sessionId String
  status String
  dueDate DateTime @db.Date
  totalMinor Int
  paidMinor Int @default(0)
  fineMinor Int @default(0)
  currency String @default("BDT")
  @@index([studentId, status])
}
model InvoiceLine {
  id String @id @default(cuid())
  invoiceId String
  feeHeadName String
  amountMinor Int
}
model Payment {
  id String @id @default(cuid())
  studentId String
  provider String
  status String
  amountMinor Int
  idempotencyKey String @unique
  providerRef String?
  paidAt DateTime?
}
model PaymentAllocation {
  id String @id @default(cuid())
  paymentId String
  invoiceId String
  amountMinor Int
}
model Waiver {
  id String @id @default(cuid())
  studentId String
  invoiceId String?
  amountMinor Int
  reason String
  approvedBy String?
}
model Notice {
  id String @id @default(cuid())
  campusId String
  title String
  body String
  bodyBn String?
  audience Json // {classIds, sectionIds, studentIds}
  channels String[] // IN_APP SMS
  status String
  scheduledAt DateTime?
}
model SmsMessage {
  id String @id @default(cuid())
  toPhone String
  body String
  status String
  providerRef String?
  noticeId String?
  createdAt DateTime @default(now())
}
model TimetableSlot {
  id String @id @default(cuid())
  sectionId String
  dayOfWeek Int
  period Int
  subjectId String
  teacherId String
  room String?
}
model AuditLog {
  id String @id @default(cuid())
  actorId String?
  campusId String?
  action String
  entity String
  entityId String?
  meta Json?
  createdAt DateTime @default(now())
  @@index([campusId, createdAt])
}
```

---

## 7. REST API (NestJS modules)

Modules: `Auth`, `Campuses`, `Sessions`, `Admissions`, `Students`, `Academics`, `Attendance`, `Exams`, `Fees`, `Payments`, `Notices`, `Guardians`, `Reports`, `Admin`.

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/login` | |
| GET | `/campuses/:id/sessions` | |
| POST | `/admissions/applications` | public/guardian |
| POST | `/admissions/merit-lists/generate` | |
| POST | `/admissions/offers/:id/accept` | seat lock |
| CRUD | `/sections`, `/enrollments` | |
| POST | `/attendance/bulk` | teacher |
| POST | `/exams/terms/:id/marks` | |
| POST | `/exams/terms/:id/publish` | |
| GET | `/students/:id/report-card` | PDF |
| GET | `/fees/invoices` | guardian scoped |
| POST | `/payments/intent` | |
| POST | `/payments/webhooks/:provider` | |
| POST | `/notices` | + SMS job |
| GET | `/guardians/me/dashboard` | |
| GET | `/reports/fee-collection` | |
| GET | `/reports/attendance-summary` | |

---

## 8. Real-time (Socket.IO)

- `section:{id}` — attendance live board for class teacher.
- `campus:{id}:notices` — new notice.
- `guardian:{userId}` — payment success, absent alert (in-app).

---

## 9. Background Jobs (BullMQ)

| Queue | Job |
|-------|-----|
| `sms` | send + retry notices/absent |
| `fees` | generate monthly invoices; late fine accrual nightly |
| `fees` | due reminders T-3/T-0 |
| `exams` | recompute GPA on mark change |
| `pdf` | report cards |
| `admission` | expire offers; promote waitlist |
| `session` | promotion batch |

---

## 10. Security

- Guardian can only see linked students.
- Marks entry audit + IP logging optional.
- Fee waiver requires Principal/Accounts dual control above threshold.
- Rate-limit SMS send APIs; template allowlist to prevent abuse.
- Encrypt document uploads; signed URLs.

---

## 11. Caching

- Redis: active session, section rosters, fee structures.
- Report card PDF cache until marks version bumps.

---

## 12. Testing Strategy

- Seat accept race → exact capacity filled.
- Fee FIFO allocation + fine calc fixtures (BD month boundaries).
- GPA calculation against NCTB sample mark sheets.
- Absent SMS dedupe per day.
- Publish hides draft results from guardian API.
- Campus isolation: teacher A cannot mark campus B.

---

## 13. Folder Structure

```
school-college-erp/
  Project_spec.md
  frontend/                 # Next.js — (admin) (teacher) (guardian) (admission public)
    src/app/...
  backend/
    src/modules/...
    prisma/schema.prisma
    test/
```

---

## 14. Environment Variables (names only)

`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `APP_URL`, `CORS_ORIGINS`, `S3_*`, `SMTP_URL`, `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID`, `STRIPE_SECRET_KEY`, `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `NAGAD_MERCHANT_ID`, `NAGAD_PRIVATE_KEY`, `FEE_FINE_PER_DAY_MINOR`, `ADMISSION_OFFER_HOURS`

---

## 15. Milestones / Phased Build

1. **M1** Auth, campuses, sessions, classes/sections, students/guardians.
2. **M2** Admission pipeline + seat offers.
3. **M3** Attendance + absent SMS.
4. **M4** Fee structures, invoices, one BD payment gateway.
5. **M5** Exams, GPA, report cards.
6. **M6** Notices, guardian dashboard polish.
7. **M7** Promotion, reports, harden multi-campus.

---

## 16. Acceptance Criteria

- [ ] Multi-campus users cannot access other campus students.
- [ ] Accepting offers never exceeds section capacity under concurrency.
- [ ] Guardian sees only PUBLISHED results.
- [ ] Partial fee payment allocates to oldest invoice first.
- [ ] Absent student triggers at most one SMS/day (full-day).
- [ ] Report card PDF matches computed GPA fixtures.
- [ ] Waiver above threshold blocked without Principal role.
- [ ] docker-compose boots API + web + Postgres + Redis.

---

## 17. Agent Implementation Notes

- Money as integer paisa; Bangla locale dates via `Asia/Dhaka`.
- `PaymentProvider` adapter identical pattern to other portfolio projects.
- Seed: 2 campuses, classes 6–10, 200 students, sample fee structure, Bangla notice templates.
- Prefer domain services: `FeeAllocationService`, `GpaCalculator`, `SeatOfferService`.
