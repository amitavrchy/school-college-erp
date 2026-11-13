# School & College ERP — Database Audit

Source: `backend/prisma/schema.prisma` (694 lines, ≈ 55 models) and three migrations (`202611110001_initial`, `202611120001_saas`, `202611120002_school_websites`). No live database; findings on indexes come from schema plus the queries read.

## 1. Schema design

| Topic | Finding |
|---|---|
| Keys | `cuid()` text IDs; composite primary key on `GuardianStudent` |
| Relations | Declared through Prisma relations in most models, so foreign keys exist for the main graph (organisation → campus → session/class/section → enrolment → marks/attendance; student → invoices → lines/allocations) |
| Money | `Int` paisa; validator cap BDT 10 lakh per amount |
| Marks | `Decimal(6,2)` |
| Dates | Calendar dates parsed as UTC midnight (`common.ts:20`); "today" computed in Asia/Dhaka |
| Enumerations | Statuses and roles are strings (`Subscription.status`, `Invoice.status`, `Payment.status`, `AdmissionApplication.status`, `UserCampusRole.role` …) |
| Tenant columns | `orgId` on `Campus`; `campusId` on root academic tables; `organizationId` on SaaS tables and `SupportTicket`; others via parents |
| Binary data | `AdmissionDocument.encryptedData Bytes`, `WebsiteAsset.content Bytes` |
| JSON | `Notice.audience`, `SchoolWebsite.draft/published`, `WebsiteRevision.content`, event/audit `meta` |

## 2. Integrity constraints (good coverage)

| Constraint | Purpose |
|---|---|
| `Enrollment (studentId, sessionId)` unique | One enrolment per session |
| `AttendanceRecord (enrollmentId, date, period)` unique | Idempotent attendance |
| `ExamMark (termId, enrollmentId, subjectId)` unique | One mark per subject per term |
| `Invoice.generationKey` unique | Idempotent monthly billing |
| `PaymentAllocation (paymentId, invoiceId)` unique | No double allocation |
| `Payment.idempotencyKey`, `Payment.providerRef` unique | Idempotent payments, no reused gateway reference |
| `SubscriptionPayment (method, reference)` unique | No reused wallet/bank reference |
| `Student (campusId, studentCode)`, `Subject (campusId, code)`, `SchoolClass (campusId, numericLevel)`, `Section (classId, sessionId, name)`, `Campus (orgId, code)`, `AcademicSession (campusId, name)`, `Holiday (campusId, date)` | Natural keys per tenant |
| `SeatOffer.applicationId`, `SeatOffer.acceptanceToken` unique | One offer per application |
| `SmsMessage.dedupeKey` unique | No duplicate SMS |
| `LibraryReservation (bookId, studentId)`, `StudentTransport (studentId, sessionId)`, `TransportTrip (assignmentId, date, journey)`, `HomeworkSubmission (homeworkId, studentId)` | Module-level idempotency |

Check constraints (non-negative money, `paidMinor <= total`) were not found in the parts of the migrations inspected — **REQUIRES FURTHER VERIFICATION**; if absent, add them.

## 3. Confirmed problems

| ID | Class | Finding | Evidence |
|---|---|---|---|
| R-B5 | CONFIRMED BUG | `TimetableSlot @@unique([teacherId, dayOfWeek, period])` has no session dimension; sections are per session, so old slots collide with new ones | schema lines 663-675 |
| R-D1 | CONFIRMED ARCHITECTURAL WEAKNESS | Files in the database: up to 5 × 5 MB per admission application plus website media. Inflates backups, replication and memory use on read | schema; `uploads.ts` |
| R-D2 | CONFIRMED ARCHITECTURAL WEAKNESS | The every-minute job selects invoices by `status IN (DUE, PARTIAL)` across all tenants; the only invoice index is `(studentId, status)` | `jobs.ts:213-215`; schema |
| R-D3 | POTENTIAL RISK | Student search uses case-insensitive `contains` on name and code without a trigram index | `students.ts:27-40` |
| R-D4 | Low | `AuditLog` index is `(campusId, createdAt)`; platform-level audit queries filter `campusId IS NULL` and entity | `saas/controllers.ts:321-327` |
| R-D5 | Low | `Payment` has no campus or organisation column; finance reports per campus must join through students | schema |
| R-D6 | Low | `AttendanceRecord @@index([date, status])` leads with date across all tenants; campus-level attendance summaries join through enrolment → section | schema |
| R-D7 | Low | No `updatedAt`/soft-delete on most tables; withdrawn students rely on enrolment status | schema |

## 4. Indexes to add

| Table | Index | Reason |
|---|---|---|
| `Invoice` | `(status, dueDate)` and `(sessionId, status)` | Fine and reminder jobs; fee reports |
| `Payment` | `(studentId, createdAt)`, `(status, createdAt)` | Lists; pending clean-up |
| `AttendanceRecord` | `(enrollmentId, date)` is covered by the unique; add `(date)` + join helper only if reports are slow | Summaries |
| `Enrollment` | `(sessionId, status)` | Billing, publication checks |
| `Student` | GIN trigram on `fullName`, `studentCode` | Search |
| `LeaveRequest` | `(studentId, status, fromDate)` | Absence job, lists |
| `Notice` | `(status, scheduledAt)` | Every-minute job |
| `SeatOffer` | `(status)` | Every-minute job |
| `SmsMessage` | `(campusId, createdAt)`, `(status)` | SMS log, retries |
| `AuditLog` | `(entity, createdAt)` | Platform audit |
| `UserCampusRole` | `(campusId, role)` | Staff lists, quota counts |

## 5. Transaction safety

| Operation | Assessment |
|---|---|
| Payment create/settle | Serializable + student row lock + idempotency. Strong |
| Student creation | Quota + section capacity under locks. Strong |
| Subscription activation/grant | Organisation row lock + idempotent reference. Strong |
| Marks entry / publish | Serializable; validates inside the transaction. Strong |
| Attendance bulk | Array transaction of upserts (default isolation); idempotent by unique key. Adequate |
| Invoice generation | Per-student upsert **outside** a transaction; idempotent by `generationKey`; a crash mid-run leaves a partial month that the next run completes. Acceptable |
| Late fines | `updateMany` guarded by `fineMinor < new` — monotonic and safe |
| Audit log | Often written after the transaction (R-S9) |

## 6. Migration safety

Three forward migrations, applied before container start in the deploy workflow (good). No backup step. `seed.ts` (demo school) and `seed-saas.ts` exist; `setup/bootstrap.ts` creates production plans and the platform admin without demo data — use only that in production.

## 7. Multi-tenant data model changes recommended

1. `OrganizationSettings` / `CampusSettings` for fee, admission, reminder and grading policy (replacing environment variables).
2. `OrganizationPaymentConfig` (encrypted gateway credentials) or a `SettlementLedger` if the platform collects.
3. `SmsCreditLedger` per organisation.
4. `TimetableSlot.sessionId` with uniques `(sessionId, sectionId, dayOfWeek, period)` and `(sessionId, teacherId, dayOfWeek, period)`.
5. Student profile fields used in Bangladesh (father's and mother's names, present/permanent address, birth registration number, religion, photo reference) — confirm the required list with pilot schools.
6. Exam mark components (`ExamMarkComponent`: written, MCQ, practical with max and pass marks).
7. Payment reversal entity and human-readable receipt/invoice numbers per campus and year.
8. Move binaries to object storage; keep metadata rows.

## 8. Verification

- Create a timetable in session A, activate session B, add the same teacher/day/period → must succeed after the fix.
- `EXPLAIN` of the fine-update selection uses the new `(status, dueDate)` index.
- Database dump size before/after moving documents out.
- Orphan check query for every relation that lacks a declared foreign key (list them with `prisma db pull` on a migrated database and compare).
