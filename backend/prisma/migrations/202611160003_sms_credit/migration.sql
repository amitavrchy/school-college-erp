CREATE TABLE "SmsCreditEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "reference" TEXT,
  "actorId" TEXT,
  "messageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsCreditEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SmsCreditEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SmsCreditEntry_amount_check" CHECK ("amount" <> 0)
);
CREATE INDEX "SmsCreditEntry_organizationId_createdAt_idx" ON "SmsCreditEntry"("organizationId", "createdAt");
CREATE INDEX "SmsCreditEntry_messageId_idx" ON "SmsCreditEntry"("messageId");
CREATE UNIQUE INDEX "SmsCreditEntry_organizationId_reference_key" ON "SmsCreditEntry"("organizationId", "reference");
