import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { OrganizationSettings, Prisma } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { Db } from './db';
import { config } from './config';
import { Actor, ADMIN, Context, Roles } from './auth/access';
import { parse } from './common';
import { Audit } from './audit';
export type Policy = Omit<OrganizationSettings, 'logoData' | 'updatedAt'> & { hasLogo: boolean };
/**
 * Per-institution policy. Organisations without a saved row use defaults taken from the
 * deployment's environment, which keeps behaviour unchanged for existing schools.
 */
export const defaults = (organizationId: string): Policy => ({
  organizationId,
  lateFineMode: config.FEE_FINE_PER_DAY_MINOR > 0 ? 'PER_DAY' : 'NONE',
  lateFinePerDayMinor: config.FEE_FINE_PER_DAY_MINOR,
  lateFineFlatMinor: 0,
  lateFineCapMinor: 50000,
  invoiceDueDay: 10,
  siblingDiscountBps: config.SIBLING_DISCOUNT_BPS,
  feeRemindersEnabled: config.FEE_REMINDERS_ENABLED,
  reminderDaysBefore: 3,
  admissionOfferHours: config.ADMISSION_OFFER_HOURS,
  waiverPrincipalThresholdMinor: 100000,
  institutionNameBn: null,
  address: null,
  phone: null,
  email: null,
  eiin: null,
  logoMime: null,
  receiptFooter: null,
  principalName: null,
  hasLogo: false,
});
/** Fine owed today under a policy; never decreases what was already charged. */
export function fineFor(
  policy: Pick<
    Policy,
    'lateFineMode' | 'lateFinePerDayMinor' | 'lateFineFlatMinor' | 'lateFineCapMinor'
  >,
  daysLate: number,
) {
  if (daysLate <= 0 || policy.lateFineMode === 'NONE') return 0;
  const raw =
    policy.lateFineMode === 'FLAT'
      ? policy.lateFineFlatMinor
      : daysLate * policy.lateFinePerDayMinor;
  return Math.min(raw, policy.lateFineCapMinor);
}
@Injectable()
export class Settings {
  constructor(@Inject(Db) private db: Db) {}
  async policy(organizationId: string, tx?: Prisma.TransactionClient): Promise<Policy> {
    const row = await (tx ?? this.db).organizationSettings.findUnique({
      where: { organizationId },
      omit: { logoData: true },
    });
    if (!row) return defaults(organizationId);
    const { updatedAt: _u, ...rest } = row;
    const logo = await (tx ?? this.db).organizationSettings.count({
      where: { organizationId, logoData: { not: null } },
    });
    return { ...rest, hasLogo: logo > 0 };
  }
  /** Branding for PDFs: institution name, Bangla name, address, contact and logo bytes. */
  async branding(campusId: string) {
    const campus = await this.db.campus.findUniqueOrThrow({
      where: { id: campusId },
      include: { organization: { include: { settings: true } } },
    });
    const s = campus.organization.settings;
    return {
      name: campus.organization.name,
      nameBn: s?.institutionNameBn ?? null,
      campus: campus.name,
      campusCode: campus.code,
      address: s?.address ?? campus.address ?? null,
      phone: s?.phone ?? null,
      email: s?.email ?? campus.organization.supportEmail ?? null,
      eiin: s?.eiin ?? null,
      logo: s?.logoData ? Buffer.from(s.logoData) : null,
      footer: s?.receiptFooter ?? null,
      principalName: s?.principalName ?? null,
      accent: campus.organization.accentColor,
    };
  }
}
const minor = z.number().int().min(0).max(10_000_000);
const policySchema = z
  .object({
    lateFineMode: z.enum(['NONE', 'PER_DAY', 'FLAT']),
    lateFinePerDayMinor: minor,
    lateFineFlatMinor: minor,
    lateFineCapMinor: minor,
    invoiceDueDay: z.number().int().min(1).max(28),
    siblingDiscountBps: z.number().int().min(0).max(10000),
    feeRemindersEnabled: z.boolean(),
    reminderDaysBefore: z.number().int().min(0).max(30),
    admissionOfferHours: z.number().int().min(1).max(720),
    waiverPrincipalThresholdMinor: minor,
    institutionNameBn: z.string().max(200).nullable(),
    address: z.string().max(300).nullable(),
    phone: z.string().max(40).nullable(),
    email: z.email().nullable(),
    eiin: z
      .string()
      .regex(/^\d{6}$/, 'EIIN is a 6-digit number')
      .nullable(),
    receiptFooter: z.string().max(300).nullable(),
    principalName: z.string().max(120).nullable(),
  })
  .partial();
@Controller('settings')
export class SettingsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Settings) private settings: Settings,
    @Inject(Audit) private audit: Audit,
  ) {}
  @Get()
  get(@Actor() c: Context) {
    return this.settings.policy(c.orgId);
  }
  @Patch()
  @Roles(...ADMIN)
  async update(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(policySchema, body);
    await this.db.$transaction(async (tx) => {
      const base = await this.settings.policy(c.orgId, tx);
      const { hasLogo: _h, organizationId: _o, ...current } = base;
      await tx.organizationSettings.upsert({
        where: { organizationId: c.orgId },
        create: { ...current, ...v, organizationId: c.orgId },
        update: v,
      });
      await this.audit.log(
        c,
        'UPDATE',
        'OrganizationSettings',
        c.orgId,
        { fields: Object.keys(v) },
        tx,
      );
    });
    return this.settings.policy(c.orgId);
  }
  /** Logo for receipts and report cards: PNG or JPEG up to 300 KB, sent as base64. */
  @Post('logo')
  @Roles(...ADMIN)
  async logo(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        mimeType: z.enum(['image/png', 'image/jpeg']),
        content: z
          .string()
          .max(420_000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      }),
      body,
    );
    const bytes = Buffer.from(v.content, 'base64');
    const ok =
      v.mimeType === 'image/png'
        ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
        : bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
    if (!ok || bytes.length > 300_000)
      throw new BadRequestException('Upload a PNG or JPEG under 300 KB');
    await this.db.$transaction(async (tx) => {
      const {
        hasLogo: _h,
        organizationId: _o,
        ...current
      } = await this.settings.policy(c.orgId, tx);
      await tx.organizationSettings.upsert({
        where: { organizationId: c.orgId },
        create: { ...current, organizationId: c.orgId, logoData: bytes, logoMime: v.mimeType },
        update: { logoData: bytes, logoMime: v.mimeType },
      });
      await this.audit.log(c, 'UPDATE', 'OrganizationLogo', c.orgId, undefined, tx);
    });
    return { ok: true };
  }
  @Get('logo')
  async getLogo(@Actor() c: Context, @Res() res: Response) {
    const s = await this.db.organizationSettings.findUnique({
      where: { organizationId: c.orgId },
      select: { logoData: true, logoMime: true },
    });
    if (!s?.logoData) return res.status(404).json({ statusCode: 404, message: 'No logo' });
    res.setHeader('Content-Type', s.logoMime || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(s.logoData));
  }
}
