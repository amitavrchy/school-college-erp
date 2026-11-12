import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { Db } from '../db';
import { Context } from '../auth/access';
import { contentSchema, defaultContent, WebsiteContent } from './content';
import { normalizeHostname, reservedSubdomains, verifyDomainRecords } from './domains';
import { config } from '../config';

@Injectable()
export class Websites {
  constructor(
    @Inject(Db) readonly db: Db,
    @Inject(JwtService) readonly jwt: JwtService,
  ) {}
  baseDomain() {
    return (process.env.SCHOOL_SITE_BASE_DOMAIN || 'localhost').toLowerCase();
  }
  appOrigin() {
    return new URL(config.APP_URL).origin;
  }
  siteOrigin(subdomain: string) {
    const base = this.baseDomain(),
      local = base === 'localhost';
    const app = new URL(config.APP_URL);
    return `${local ? 'http' : 'https'}://${subdomain}.${base}${local && app.port ? ':' + app.port : ''}`;
  }
  async get(c: Context) {
    const site = await this.db.schoolWebsite.findUnique({
      where: { organizationId: c.orgId },
      include: {
        domains: { orderBy: { createdAt: 'desc' } },
        assets: {
          select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        revisions: {
          select: { id: true, version: true, actorId: true, createdAt: true },
          orderBy: { version: 'desc' },
          take: 100,
        },
      },
    });
    return {
      site,
      baseDomain: this.baseDomain(),
      cnameTarget: process.env.SCHOOL_SITE_CNAME_TARGET || '',
      subdomainUrl: site ? this.siteOrigin(site.subdomain) : null,
      appOrigin: this.appOrigin(),
    };
  }
  async owned(c: Context) {
    return this.db.schoolWebsite.findUniqueOrThrow({ where: { organizationId: c.orgId } });
  }
  audit(
    tx: Prisma.TransactionClient,
    c: Context,
    action: string,
    id: string,
    meta?: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: {
        campusId: c.campusId,
        actorId: c.userId,
        action,
        entity: 'SchoolWebsite',
        entityId: id,
        meta,
      },
    });
  }
  async create(c: Context, subdomain: string) {
    if (reservedSubdomains.has(subdomain))
      throw new BadRequestException('Choose a different school subdomain');
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: c.orgId } });
    const claimed = await this.db.organization.findUnique({ where: { slug: subdomain } });
    if (claimed && claimed.id !== c.orgId)
      throw new ConflictException('This institution name is already reserved');
    return this.db.$transaction(async (tx) => {
      const site = await tx.schoolWebsite.create({
        data: { organizationId: c.orgId, subdomain, draft: defaultContent(org.name) },
      });
      await this.audit(tx, c, 'WEBSITE_CREATED', site.id);
      return site;
    });
  }
  async save(c: Context, revision: number, content: WebsiteContent) {
    if (Buffer.byteLength(JSON.stringify(content)) > 512 * 1024)
      throw new BadRequestException(
        'Website content must fit within 512 KB. Upload images as media instead.',
      );
    return this.db.$transaction(async (tx) => {
      const site = await tx.schoolWebsite.findUniqueOrThrow({ where: { organizationId: c.orgId } });
      const changed = await tx.schoolWebsite.updateMany({
        where: { id: site.id, revision },
        data: { draft: content, revision: { increment: 1 } },
      });
      if (!changed.count)
        throw new ConflictException('Another editor changed this website. Reload before saving.');
      await this.audit(tx, c, 'WEBSITE_DRAFT_SAVED', site.id, { revision: revision + 1 });
      return tx.schoolWebsite.findUniqueOrThrow({ where: { id: site.id } });
    });
  }
  async publish(c: Context, revision: number) {
    return this.db.serial(async (tx) => {
      const site = await tx.schoolWebsite.findUniqueOrThrow({ where: { organizationId: c.orgId } });
      if (site.revision !== revision)
        throw new ConflictException('Your editor is out of date. Reload before publishing.');
      const content = contentSchema.parse(site.draft);
      if (site.publishedRevision === revision && site.published) return site;
      await tx.websiteRevision.upsert({
        where: { websiteId_version: { websiteId: site.id, version: revision } },
        create: { websiteId: site.id, version: revision, content, actorId: c.userId },
        update: {},
      });
      const result = await tx.schoolWebsite.update({
        where: { id: site.id },
        data: { published: content, publishedAt: new Date(), publishedRevision: revision },
      });
      await this.audit(tx, c, 'WEBSITE_PUBLISHED', site.id, { revision });
      return result;
    });
  }
  async unpublish(c: Context) {
    return this.db.$transaction(async (tx) => {
      const site = await tx.schoolWebsite.update({
        where: { organizationId: c.orgId },
        data: { published: Prisma.DbNull, publishedAt: null, publishedRevision: null },
      });
      await this.audit(tx, c, 'WEBSITE_UNPUBLISHED', site.id);
      return site;
    });
  }
  async restore(c: Context, id: string, revision: number) {
    const site = await this.owned(c);
    const version = await this.db.websiteRevision.findFirstOrThrow({
      where: { id, websiteId: site.id },
    });
    return this.save(c, revision, contentSchema.parse(version.content));
  }
  async preview(c: Context) {
    const site = await this.owned(c);
    const token = await this.jwt.signAsync(
      { purpose: 'website-preview', websiteId: site.id },
      { expiresIn: '15m' },
    );
    return { url: `/school/${site.subdomain}?preview=${token}`, expiresIn: 900 };
  }
  async resolve(host: string) {
    const hostname = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    const suffix = '.' + this.baseDomain();
    const site =
      hostname.endsWith(suffix) && !hostname.slice(0, -suffix.length).includes('.')
        ? await this.db.schoolWebsite.findUnique({
            where: { subdomain: hostname.slice(0, -suffix.length) },
            include: { organization: true },
          })
        : (
            await this.db.websiteDomain.findFirst({
              where: { hostname, status: 'VERIFIED' },
              include: { website: { include: { organization: true } } },
            })
          )?.website;
    if (!site?.published || site.organization.status !== 'ACTIVE')
      throw new NotFoundException('School website not found');
    return { subdomain: site.subdomain };
  }
  async publicSite(subdomain: string, preview?: string) {
    const site = await this.db.schoolWebsite.findUnique({
      where: { subdomain },
      include: {
        organization: true,
        domains: { where: { status: 'VERIFIED' }, orderBy: { hostname: 'asc' } },
      },
    });
    if (!site || site.organization.status !== 'ACTIVE')
      throw new NotFoundException('School website not found');
    let content: WebsiteContent;
    if (preview) {
      let claim;
      try {
        claim = await this.jwt.verifyAsync(preview);
      } catch {
        throw new ForbiddenException('Preview link expired');
      }
      if (claim.purpose !== 'website-preview' || claim.websiteId !== site.id)
        throw new ForbiddenException('Invalid preview link');
      content = contentSchema.parse(site.draft);
    } else {
      if (!site.published) throw new NotFoundException('School website not found');
      content = contentSchema.parse(site.published);
      const now = new Date().toISOString();
      content.posts = content.posts
        .filter((p) => p.publishAt <= now && (!p.expiresAt || p.expiresAt > now))
        .sort(
          (a, b) => Number(b.pinned) - Number(a.pinned) || b.publishAt.localeCompare(a.publishAt),
        );
    }
    return {
      subdomain: site.subdomain,
      organizationSlug: site.organization.slug,
      content,
      preview: !!preview,
      publishedAt: site.publishedAt,
      origin: site.domains[0] ? `https://${site.domains[0].hostname}` : this.siteOrigin(subdomain),
      appOrigin: this.appOrigin(),
      revision: site.publishedRevision,
    };
  }
  async checkOrigin(subdomain: string, origin?: string) {
    if (!origin) return;
    if (origin === this.appOrigin()) return;
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ForbiddenException('Invalid request origin');
    }
    let site: { subdomain: string };
    try {
      site = await this.resolve(parsed.hostname);
    } catch {
      throw new ForbiddenException('Request origin does not belong to this school');
    }
    if (
      site.subdomain !== subdomain ||
      (parsed.protocol !== 'https:' && !parsed.hostname.endsWith('.localhost'))
    )
      throw new ForbiddenException('Request origin does not belong to this school');
  }
  async addDomain(c: Context, input: string) {
    let hostname: string;
    try {
      hostname = normalizeHostname(input);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (
      hostname === new URL(config.APP_URL).hostname ||
      hostname === this.baseDomain() ||
      hostname.endsWith('.' + this.baseDomain()) ||
      hostname.endsWith('.localhost')
    )
      throw new BadRequestException('Use your institution’s own public domain');
    const site = await this.owned(c);
    if ((await this.db.websiteDomain.count({ where: { websiteId: site.id } })) >= 10)
      throw new BadRequestException('A website supports up to 10 domains');
    return this.db.websiteDomain.create({
      data: { websiteId: site.id, hostname, verificationToken: randomBytes(24).toString('hex') },
    });
  }
  async verifyDomain(c: Context, domainId: string) {
    const site = await this.owned(c);
    const domain = await this.db.websiteDomain.findFirstOrThrow({
      where: { id: domainId, websiteId: site.id },
    });
    const target = process.env.SCHOOL_SITE_CNAME_TARGET;
    if (!target)
      throw new ServiceUnavailableException(
        'The platform must configure its domain routing target first',
      );
    let verified = false;
    try {
      verified = await Promise.race([
        verifyDomainRecords(domain.hostname, domain.verificationToken, target),
        new Promise<false>((resolve) => {
          const timer = setTimeout(() => resolve(false), 6000);
          timer.unref();
        }),
      ]);
    } catch {}
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${domain.hostname}))`;
      if (verified)
        await tx.websiteDomain.updateMany({
          where: { hostname: domain.hostname, status: 'VERIFIED', id: { not: domain.id } },
          data: { status: 'REVOKED', verifiedAt: null },
        });
      const updated = await tx.websiteDomain.update({
        where: { id: domain.id },
        data: {
          status: verified ? 'VERIFIED' : 'PENDING',
          verifiedAt: verified ? new Date() : null,
          checkedAt: new Date(),
        },
      });
      await this.audit(tx, c, verified ? 'DOMAIN_VERIFIED' : 'DOMAIN_CHECK_FAILED', site.id, {
        hostname: domain.hostname,
      });
      return updated;
    });
  }
  async removeDomain(c: Context, domainId: string) {
    const site = await this.owned(c);
    const domain = await this.db.websiteDomain.findFirstOrThrow({
      where: { id: domainId, websiteId: site.id },
    });
    return this.db.$transaction(async (tx) => {
      await tx.websiteDomain.delete({ where: { id: domain.id } });
      await this.audit(tx, c, 'DOMAIN_REMOVED', site.id, { hostname: domain.hostname });
      return { removed: true };
    });
  }
  async upload(c: Context, v: { fileName: string; mimeType: string; base64: string }) {
    const buffer = Buffer.from(v.base64, 'base64');
    const magic =
      v.mimeType === 'image/jpeg'
        ? buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        : v.mimeType === 'image/png'
          ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : v.mimeType === 'image/webp'
            ? buffer.subarray(0, 4).toString() === 'RIFF' &&
              buffer.subarray(8, 12).toString() === 'WEBP'
            : v.mimeType === 'application/pdf' && buffer.subarray(0, 5).toString() === '%PDF-';
    if (!magic || !buffer.length || buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException('Upload a valid JPEG, PNG, WebP or PDF up to 5 MB');
    const site = await this.owned(c);
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SchoolWebsite" WHERE id = ${site.id} FOR UPDATE`;
      const quota = await tx.websiteAsset.aggregate({
        where: { websiteId: site.id },
        _count: true,
        _sum: { size: true },
      });
      if (quota._count >= 100 || (quota._sum.size || 0) + buffer.length > 100 * 1024 * 1024)
        throw new BadRequestException('Website media quota reached (100 files / 100 MB)');
      const asset = await tx.websiteAsset.create({
        data: {
          id: randomUUID().replaceAll('-', ''),
          websiteId: site.id,
          fileName: v.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120),
          mimeType: v.mimeType,
          content: buffer,
          size: buffer.length,
        },
        select: { id: true, fileName: true, mimeType: true, size: true },
      });
      return { ...asset, url: `/api/public-websites/media/${asset.id}` };
    });
  }
  async removeAsset(c: Context, id: string) {
    const site = await this.owned(c);
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SchoolWebsite" WHERE id = ${site.id} FOR UPDATE`;
      const asset = await tx.websiteAsset.findFirstOrThrow({ where: { id, websiteId: site.id } });
      const current = await tx.schoolWebsite.findUniqueOrThrow({ where: { id: site.id } });
      const history = await tx.websiteRevision.findMany({
        where: { websiteId: site.id },
        select: { content: true },
      });
      if (
        [current.draft, current.published, ...history.map((v) => v.content)].some((v) =>
          JSON.stringify(v)?.includes('/media/' + id),
        )
      )
        throw new BadRequestException(
          'This file is used in a draft, live page or saved version. Keep it to preserve those pages.',
        );
      await tx.websiteAsset.delete({ where: { id: asset.id } });
      await this.audit(tx, c, 'WEBSITE_MEDIA_REMOVED', site.id, { assetId: id });
      return { removed: true };
    });
  }
}
