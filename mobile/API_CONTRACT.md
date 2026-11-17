# Mobile API contract

Paths are relative to `/api`. Authenticated requests carry a bearer token and `x-campus-id`. Family data is scoped to the signed-in student or guardian's linked children in that campus. Dates are ISO strings; money is in minor units.

| Method and path | Request | Response fields used by app |
| --- | --- | --- |
| GET `/app/config` | `school` query | `active`, `subscriptionPastDue`, `minimumVersion`, `support.phone`, `support.email` |
| POST `/auth/codes` | `purpose: GUARDIAN_LOGIN`, `contact`, `school` | No fields read |
| POST `/auth/token/otp` | `school`, `contact`, `code`, `deviceName` | `accessToken`, `refreshToken`, `campuses[].id` |
| POST `/auth/token` | `school`, `email`, `password`, `deviceName` | Tokens and campuses above, or `mfaRequired`, `challenge` |
| POST `/auth/token/mfa` | `challenge`, `code` | Tokens and campuses above |
| POST `/auth/refresh` | `refreshToken` | `accessToken`, `refreshToken` |
| POST `/auth/token/revoke` | `refreshToken` | No fields read |
| GET `/auth/me` | Auth and campus headers | `fullName`, `roles[].campusId`, `roles[].role` |
| GET `/guardians/me/dashboard` | Auth and campus headers | `students[]`: `id`, `fullName`, `fullNameBn`, `enrollments[]` (`status`, `rollNumber`, `section.name`, `section.schoolClass.name`, `attendance[].date/status`), `invoices[]` (`dueDate`, `totalMinor`, `fineMinor`, `waivedMinor`, `paidMinor`) |
| GET `/notices` | Auth and campus headers | Array: `title`, `body`, `bodyBn`, `createdAt` |
| GET `/fees/invoices` | Auth and campus headers | Array: `studentId`, `dueDate`, `status`, `lines[].feeHeadName`, `totalMinor`, `fineMinor`, `waivedMinor`, `paidMinor` |
| GET `/payments` | Auth and campus headers | Array: `id`, `studentId`, `amountMinor`, `receiptNo`, `paidAt`, `createdAt`, `status` |
| GET `/exams/results/:studentId` | Auth and campus headers | Array: `terms[]` containing `term.name`, `gpa`, `marks[]` (`subject.name`, `isAbsent`, `marksObtained`, `maxMarks`, `grade.letter`) |
| GET `/students/:id/report-card`, `/payments/:id/receipt` | Auth and campus headers | PDF bytes |

OTP issuance is limited by IP and destination; mobile login attempts (including OTP and MFA) are limited by IP and account. Refresh tokens rotate. Offline data is cached per campus and cleared on sign-out.
