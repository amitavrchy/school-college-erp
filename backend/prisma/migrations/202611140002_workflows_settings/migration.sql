-- Stage 2 workflows + Stage 3.1 organisation settings.
-- Written to be safe on populated tables: columns are added nullable or with defaults,
-- backfilled, and only then constrained.

-- Student profile (all optional)
ALTER TABLE "Student" ADD COLUMN "birthRegNo" TEXT,
ADD COLUMN "fatherName" TEXT,
ADD COLUMN "motherName" TEXT,
ADD COLUMN "nationality" TEXT DEFAULT 'Bangladeshi',
ADD COLUMN "permanentAddress" TEXT,
ADD COLUMN "photoKey" TEXT,
ADD COLUMN "presentAddress" TEXT,
ADD COLUMN "religion" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "guardianName" TEXT,
ADD COLUMN "guardianPhone" TEXT;

-- Monthly billing runs once per structure per month
ALTER TABLE "FeeStructure" ADD COLUMN "lastGeneratedMonth" TEXT;

-- Sibling discount is an explicit flag; keep today's behaviour for heads named "tuition"
ALTER TABLE "FeeHead" ADD COLUMN "siblingDiscountEligible" BOOLEAN NOT NULL DEFAULT false;
UPDATE "FeeHead" SET "siblingDiscountEligible" = true WHERE "name" ILIKE '%tuition%';

-- Receipt numbers and payment void workflow
ALTER TABLE "Payment" ADD COLUMN "receiptCampusId" TEXT,
ADD COLUMN "receiptNo" TEXT,
ADD COLUMN "recordedBy" TEXT,
ADD COLUMN "voidReason" TEXT,
ADD COLUMN "voidRequestedAt" TIMESTAMP(3),
ADD COLUMN "voidRequestedBy" TEXT,
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidedBy" TEXT;

-- Timetable belongs to a session: add, backfill from the section, then constrain
ALTER TABLE "TimetableSlot" ADD COLUMN "sessionId" TEXT;
UPDATE "TimetableSlot" t SET "sessionId" = s."sessionId" FROM "Section" s WHERE s."id" = t."sectionId";
ALTER TABLE "TimetableSlot" ALTER COLUMN "sessionId" SET NOT NULL;
DROP INDEX "TimetableSlot_sectionId_dayOfWeek_period_key";
DROP INDEX "TimetableSlot_teacherId_dayOfWeek_period_key";
CREATE UNIQUE INDEX "TimetableSlot_sessionId_sectionId_dayOfWeek_period_key" ON "TimetableSlot"("sessionId", "sectionId", "dayOfWeek", "period");
CREATE UNIQUE INDEX "TimetableSlot_sessionId_teacherId_dayOfWeek_period_key" ON "TimetableSlot"("sessionId", "teacherId", "dayOfWeek", "period");

-- Roll numbers unique within a section (a section belongs to one session).
-- Earlier code used "count + 1", which could repeat after a withdrawal; suffix any repeats
-- so the constraint can be created without losing the original number.
WITH d AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "sectionId", "rollNumber" ORDER BY "id") AS n
  FROM "Enrollment" WHERE "rollNumber" IS NOT NULL
)
UPDATE "Enrollment" e SET "rollNumber" = e."rollNumber" || '-' || d.n FROM d WHERE d."id" = e."id" AND d.n > 1;
CREATE UNIQUE INDEX "Enrollment_sectionId_rollNumber_key" ON "Enrollment"("sectionId", "rollNumber");

CREATE TABLE "OrganizationSettings" (
    "organizationId" TEXT NOT NULL,
    "lateFineMode" TEXT NOT NULL DEFAULT 'PER_DAY',
    "lateFinePerDayMinor" INTEGER NOT NULL DEFAULT 1000,
    "lateFineFlatMinor" INTEGER NOT NULL DEFAULT 0,
    "lateFineCapMinor" INTEGER NOT NULL DEFAULT 50000,
    "invoiceDueDay" INTEGER NOT NULL DEFAULT 10,
    "siblingDiscountBps" INTEGER NOT NULL DEFAULT 0,
    "feeRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 3,
    "admissionOfferHours" INTEGER NOT NULL DEFAULT 48,
    "waiverPrincipalThresholdMinor" INTEGER NOT NULL DEFAULT 100000,
    "institutionNameBn" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "eiin" TEXT,
    "logoData" BYTEA,
    "logoMime" TEXT,
    "receiptFooter" TEXT,
    "principalName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("organizationId")
);
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FeeHeadCharge" (
    "enrollmentId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeHeadCharge_pkey" PRIMARY KEY ("enrollmentId","feeHeadId")
);
ALTER TABLE "FeeHeadCharge" ADD CONSTRAINT "FeeHeadCharge_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Existing one-time charges: record heads already invoiced so they are not billed again.
INSERT INTO "FeeHeadCharge" ("enrollmentId", "feeHeadId", "invoiceId")
SELECT DISTINCT ON (e."id", h."id") e."id", h."id", i."id"
FROM "FeeHead" h
JOIN "FeeStructure" fs ON fs."id" = h."structureId"
JOIN "Invoice" i ON i."generationKey" LIKE fs."id" || '-%' AND i."sessionId" = fs."sessionId"
JOIN "InvoiceLine" l ON l."invoiceId" = i."id" AND l."feeHeadName" = h."name"
JOIN "Enrollment" e ON e."studentId" = i."studentId" AND e."sessionId" = i."sessionId"
WHERE h."frequency" = 'ONCE'
ORDER BY e."id", h."id", i."dueDate";

CREATE TABLE "ReceiptCounter" (
    "campusId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("campusId","year")
);
CREATE UNIQUE INDEX "Payment_receiptCampusId_receiptNo_key" ON "Payment"("receiptCampusId", "receiptNo");

-- Backlog: scheduled notices are polled every minute
CREATE INDEX IF NOT EXISTS "Notice_status_scheduledAt_idx" ON "Notice"("status", "scheduledAt");
