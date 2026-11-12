-- CreateTable
CREATE TABLE "SchoolWebsite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolWebsite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteRevision" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteDomain" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteAsset" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteInquiry" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolWebsite_organizationId_key" ON "SchoolWebsite"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolWebsite_subdomain_key" ON "SchoolWebsite"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteRevision_websiteId_version_key" ON "WebsiteRevision"("websiteId", "version");

-- CreateIndex
CREATE INDEX "WebsiteDomain_hostname_status_idx" ON "WebsiteDomain"("hostname", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteDomain_websiteId_hostname_key" ON "WebsiteDomain"("websiteId", "hostname");

-- CreateIndex
CREATE INDEX "WebsiteInquiry_websiteId_createdAt_idx" ON "WebsiteInquiry"("websiteId", "createdAt");

-- AddForeignKey
ALTER TABLE "SchoolWebsite" ADD CONSTRAINT "SchoolWebsite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteRevision" ADD CONSTRAINT "WebsiteRevision_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "SchoolWebsite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteDomain" ADD CONSTRAINT "WebsiteDomain_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "SchoolWebsite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteAsset" ADD CONSTRAINT "WebsiteAsset_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "SchoolWebsite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteInquiry" ADD CONSTRAINT "WebsiteInquiry_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "SchoolWebsite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "WebsiteDomain_verified_hostname" ON "WebsiteDomain"("hostname") WHERE "status" = 'VERIFIED';

