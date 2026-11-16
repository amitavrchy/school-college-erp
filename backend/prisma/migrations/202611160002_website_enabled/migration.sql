ALTER TABLE "Organization" ADD COLUMN "websiteEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Organization" SET "websiteEnabled" = true
WHERE EXISTS (SELECT 1 FROM "SchoolWebsite" WHERE "SchoolWebsite"."organizationId" = "Organization"."id");
