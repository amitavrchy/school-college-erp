import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Jobs } from '../jobs';
import { normalizeContact } from '../auth/otp';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, ACADEMIC, ADMISSIONS } from '../auth/access';
import { Scope } from '../auth/scope';
import { Audit } from '../audit';
import { date, id, parse, phone } from '../common';
const text = (max: number) => z.string().trim().min(1).max(max);
/** Optional profile fields shared by single admission, import and edit. */
const profile = z.object({
  fullName: z.string().trim().min(2).max(100),
  fullNameBn: text(100).optional(),
  dob: date.optional(),
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  fatherName: text(100).optional(),
  motherName: text(100).optional(),
  presentAddress: text(300).optional(),
  permanentAddress: text(300).optional(),
  birthRegNo: z
    .string()
    .regex(/^\d{17}$/, 'Birth registration number has 17 digits')
    .optional(),
  religion: z.enum(['Islam', 'Hinduism', 'Buddhism', 'Christianity', 'Other']).optional(),
  nationality: text(50).optional(),
  guardianName: text(100).optional(),
  guardianPhone: phone.optional(),
});
const studentCode = z.string().trim().min(2).max(40);
const roll = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,10}$/, 'Roll is up to 10 letters or digits');
import { requireQuota } from '../saas/policy';
@Controller()
export class StudentsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
    @Inject(Audit) private audit: Audit,
    @Inject(Jobs) private jobs: Jobs,
  ) {}
  @Get('students')
  async students(@Actor() c: Context, @Query() query: Record<string, string>) {
    const q = parse(
      z.object({
        search: z.string().max(100).default(''),
        sectionId: id.optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(20),
      }),
      query,
    );
    const where = {
      AND: [
        this.scope.studentFilter(c),
        {
          OR: [
            { fullName: { contains: q.search, mode: 'insensitive' as const } },
            { studentCode: { contains: q.search, mode: 'insensitive' as const } },
          ],
          ...(q.sectionId
            ? { enrollments: { some: { sectionId: q.sectionId, status: 'ACTIVE' } } }
            : {}),
        },
      ],
    };
    const [items, total] = await Promise.all([
      this.db.student.findMany({
        where,
        include: {
          enrollments: {
            where: { status: 'ACTIVE' },
            include: { section: { include: { schoolClass: true } } },
          },
          guardians: { include: { guardian: { select: { fullName: true, phone: true } } } },
        },
        orderBy: { studentCode: 'asc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.student.count({ where }),
    ]);
    return { items, total, page: q.page, pages: Math.ceil(total / q.limit) };
  }
  @Get('students/:id')
  async detail(@Actor() c: Context, @Param('id') studentId: string) {
    await this.scope.student(c, studentId);
    return this.db.student.findUnique({
      where: { id: studentId },
      include: {
        enrollments: { include: { section: { include: { schoolClass: true } }, session: true } },
        guardians: {
          include: { guardian: { select: { fullName: true, phone: true, email: true } } },
        },
      },
    });
  }
  @Post('students')
  @Roles(...ADMISSIONS)
  async create(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      profile.extend({ studentCode, sectionId: id, rollNumber: roll.optional() }),
      body,
    );
    const section = await this.scope.section(c, v.sectionId, true);
    return this.db.serial((tx) => this.admit(tx, c, section, v));
  }
  /**
   * Bulk admission from a spreadsheet the browser has already parsed. Each row is admitted in
   * its own transaction, so one bad row does not block the rest; results come back per row.
   */
  @Post('students/import')
  @Roles(...ADMISSIONS)
  async import(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        sectionId: id.optional(),
        rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
      }),
      body,
    );
    const sections = new Map<string, Awaited<ReturnType<Scope['section']>>>();
    const results: { row: number; ok: boolean; id?: string; error?: string }[] = [];
    for (const [index, raw] of v.rows.entries()) {
      const row = index + 1;
      const parsed = profile
        .extend({ studentCode, sectionId: id.optional(), rollNumber: roll.optional() })
        .safeParse(raw);
      if (!parsed.success) {
        results.push({
          row,
          ok: false,
          error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
        continue;
      }
      const sectionId = parsed.data.sectionId || v.sectionId;
      try {
        if (!sectionId) throw new BadRequestException('sectionId: choose a section');
        if (!sections.has(sectionId))
          sections.set(sectionId, await this.scope.section(c, sectionId, true));
        const created = await this.db.serial((tx) =>
          this.admit(tx, c, sections.get(sectionId)!, { ...parsed.data, sectionId }),
        );
        results.push({ row, ok: true, id: created.id });
      } catch (error) {
        const message =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
            ? 'Student code or roll number already exists'
            : error instanceof HttpException
              ? String((error.getResponse() as any)?.message ?? error.message)
              : 'Could not admit this student';
        results.push({ row, ok: false, error: message });
      }
    }
    return {
      created: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }
  /**
   * Turns guardian mobile numbers captured at admission or import into guardian accounts for the
   * school's app: one account per number in this school (siblings share it), linked as primary
   * guardian, with an SMS invitation. Students who already have a guardian are skipped.
   */
  @Post('students/invite-guardians')
  @Roles(...ADMISSIONS)
  async inviteGuardians(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({ sectionId: id.optional(), sendSms: z.boolean().default(true) }),
      body,
    );
    if (v.sectionId) await this.scope.section(c, v.sectionId);
    const students = await this.db.student.findMany({
      where: {
        campusId: c.campusId,
        guardianPhone: { not: null },
        guardians: { none: {} },
        ...(v.sectionId
          ? { enrollments: { some: { sectionId: v.sectionId, status: 'ACTIVE' } } }
          : {}),
      },
      select: {
        id: true,
        guardianPhone: true,
        guardianName: true,
        fatherName: true,
        motherName: true,
      },
      take: 1000,
    });
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: c.orgId } });
    let created = 0,
      linked = 0;
    const invited = new Set<string>();
    for (const s of students) {
      const phoneNo = normalizeContact(s.guardianPhone!);
      const guardianId = await this.db.serial(async (tx) => {
        let guardian = await tx.user.findFirst({
          where: { phone: phoneNo, memberships: { some: { organizationId: c.orgId } } },
        });
        if (!guardian) {
          guardian = await tx.user.create({
            data: {
              fullName: s.guardianName || s.fatherName || s.motherName || 'Guardian',
              phone: phoneNo,
              passwordHash: await hash(randomBytes(24).toString('base64url'), 12),
              memberships: { create: { organizationId: c.orgId, role: 'MEMBER' } },
            },
          });
          created++;
        }
        await tx.userCampusRole.createMany({
          data: [{ userId: guardian.id, campusId: c.campusId, role: 'GUARDIAN' }],
          skipDuplicates: true,
        });
        await tx.guardianStudent.create({
          data: {
            guardianUserId: guardian.id,
            studentId: s.id,
            relation: 'Guardian',
            isPrimary: true,
          },
        });
        await this.audit.log(c, 'INVITE_GUARDIAN', 'Student', s.id, undefined, tx);
        return guardian.id;
      });
      linked++;
      if (v.sendSms && !invited.has(guardianId)) {
        invited.add(guardianId);
        await this.jobs.sms(
          c.campusId,
          phoneNo,
          `${org.name}: download the ${org.name} app from Google Play and sign in with this mobile number to see attendance, results and fees.`,
          `guardian-invite-${guardianId}`,
        );
      }
    }
    return { students: students.length, linked, accountsCreated: created, invited: invited.size };
  }
  @Patch('students/:id')
  @Roles(...ADMISSIONS)
  async update(@Actor() c: Context, @Param('id') studentId: string, @Body() body: unknown) {
    await this.scope.student(c, studentId);
    const v = parse(
      profile
        .partial()
        .extend({ studentCode: studentCode.optional(), rollNumber: roll.nullable().optional() })
        .refine((x) => Object.keys(x).length > 0, 'Nothing to change'),
      body,
    );
    const { rollNumber, ...data } = v;
    return this.db.serial(async (tx) => {
      const student = await tx.student.update({ where: { id: studentId }, data });
      if (rollNumber !== undefined) {
        const enrollment = await tx.enrollment.findFirst({
          where: { studentId, status: 'ACTIVE', session: { status: { not: 'CLOSED' } } },
        });
        if (!enrollment) throw new BadRequestException('The student has no open enrolment');
        await tx.enrollment.update({ where: { id: enrollment.id }, data: { rollNumber } });
      }
      await this.audit.log(c, 'UPDATE', 'Student', studentId, { fields: Object.keys(v) }, tx);
      return student;
    });
  }
  private async admit(
    tx: Prisma.TransactionClient,
    c: Context,
    section: { id: string; sessionId: string; capacity: number },
    v: z.infer<typeof profile> & { studentCode: string; sectionId: string; rollNumber?: string },
  ) {
    const { sectionId, rollNumber, ...data } = v;
    await requireQuota(tx, c.orgId, 'students');
    await tx.$queryRaw`SELECT id FROM "Section" WHERE id = ${sectionId} FOR UPDATE`;
    const count = await tx.enrollment.count({ where: { sectionId, status: 'ACTIVE' } });
    if (count >= section.capacity) throw new ConflictException('Section is full');
    let roll = rollNumber;
    if (!roll) {
      // Next free number after the highest numeric roll, not "count + 1" (which repeats after a withdrawal).
      const rolls = await tx.enrollment.findMany({
        where: { sectionId },
        select: { rollNumber: true },
      });
      roll = String(
        Math.max(0, ...rolls.map((r) => Number(r.rollNumber)).filter(Number.isFinite)) + 1,
      );
    } else if (await tx.enrollment.findFirst({ where: { sectionId, rollNumber: roll } }))
      throw new ConflictException(`Roll ${roll} is already used in this section`);
    const created = await tx.student.create({
      data: {
        ...data,
        campusId: c.campusId,
        enrollments: { create: { sectionId, sessionId: section.sessionId, rollNumber: roll } },
      },
    });
    await this.audit.log(c, 'CREATE', 'Student', created.id, undefined, tx);
    return created;
  }
  @Post('students/:id/guardians')
  @Roles(...ACADEMIC)
  async guardian(@Actor() c: Context, @Param('id') studentId: string, @Body() body: unknown) {
    await this.scope.student(c, studentId);
    const v = parse(
      z.object({
        guardianUserId: id,
        relation: z.string().min(2).max(30),
        isPrimary: z.boolean().default(false),
      }),
      body,
    );
    await this.db.userCampusRole.findFirstOrThrow({
      where: { userId: v.guardianUserId, campusId: c.campusId, role: 'GUARDIAN' },
    });
    return this.db.serial(async (tx) => {
      if (v.isPrimary)
        await tx.guardianStudent.updateMany({ where: { studentId }, data: { isPrimary: false } });
      return tx.guardianStudent.upsert({
        where: { guardianUserId_studentId: { guardianUserId: v.guardianUserId, studentId } },
        create: { ...v, studentId },
        update: v,
      });
    });
  }
}
