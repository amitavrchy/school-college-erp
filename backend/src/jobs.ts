import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Db } from './db';
import { config } from './config';
import { today } from './common';
import { createHash } from 'node:crypto';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { Realtime } from './realtime';
import { Billing } from './modules/billing';
import { Notifier } from './notify';
import { Settings } from './settings';
import { subscriptionUsable } from './saas/policy';
@Injectable()
export class Jobs implements OnModuleInit, OnModuleDestroy {
  private connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  private queue = new Queue('campus-work', {
    connection: this.connection as any,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  });
  private worker?: Worker;
  async ping() {
    if (this.connection.status !== 'ready') throw new Error('Job storage is unavailable');
    return this.connection.ping();
  }
  async publicLimit(key: string, limit: number, seconds: number) {
    if (this.connection.status !== 'ready')
      throw new ServiceUnavailableException('Please try again shortly');
    const hashed = createHash('sha256').update(key).digest('hex');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let count: number;
    try {
      count = Number(
        await Promise.race([
          this.connection.eval(
            "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
            1,
            `school-public:${hashed}`,
            seconds,
          ),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new ServiceUnavailableException('Please try again shortly')),
              2500,
            );
          }),
        ]),
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (count > limit) throw new HttpException('Too many attempts. Please try again later.', 429);
  }
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Realtime) private realtime: Realtime,
    @Inject(Billing) private billing: Billing,
    @Inject(Notifier) private notifier: Notifier,
    @Inject(Settings) private settings: Settings,
  ) {}
  async onModuleInit() {
    // The API process enqueues; processing happens where RUN_JOBS is true (the worker container).
    if (!config.RUN_JOBS) return;
    this.worker = new Worker(
      'campus-work',
      async (job) => {
        switch (job.name) {
          case 'sms':
            return this.sendSms(job.data.id);
          case 'absence':
            return this.absence(job.data.enrollmentId, job.data.date);
          case 'notices':
            return this.notices();
          case 'fines':
            return this.fines();
          case 'monthly-billing':
            return this.monthlyBilling();
          case 'fee-reminders':
            return this.feeReminders();
          case 'offer-expiry':
            return this.offerExpiry();
        }
      },
      { connection: this.connection as any, concurrency: 4 },
    );
    this.worker.on('failed', (job, error) =>
      console.error('Background job failed', job?.name, job?.id, error.message),
    );
    // Replaces the old every-minute "maintenance" job that scanned every table.
    await this.queue.removeJobScheduler('maintenance').catch(() => undefined);
    const tz = 'Asia/Dhaka';
    const schedules: [string, { every?: number; pattern?: string; tz?: string }][] = [
      ['notices', { every: 60_000 }],
      ['offer-expiry', { every: 10 * 60_000 }],
      ['fines', { pattern: '0 1 * * *', tz }],
      ['monthly-billing', { pattern: '30 0 * * *', tz }],
      ['fee-reminders', { pattern: '0 9 * * *', tz }],
    ];
    for (const [name, repeat] of schedules)
      await this.queue.upsertJobScheduler(name, repeat, { name, data: {} });
  }
  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
  async enqueueAbsence(enrollmentId: string, date: string) {
    await this.queue.add(
      'absence',
      { enrollmentId, date },
      { jobId: `absence-${enrollmentId}-${date}`, delay: 30 * 60_000 },
    );
  }
  async sms(campusId: string, toPhone: string, body: string, dedupeKey: string, noticeId?: string) {
    await this.db.smsMessage.createMany({
      data: { campusId, toPhone, body, dedupeKey, noticeId },
      skipDuplicates: true,
    });
    const message = await this.db.smsMessage.findUniqueOrThrow({ where: { dedupeKey } });
    if (['QUEUED', 'FAILED'].includes(message.status))
      await this.queue.add('sms', { id: message.id }, { jobId: `sms-${message.id}` });
  }
  async sendSms(id: string) {
    const message = await this.db.smsMessage.findUniqueOrThrow({ where: { id } });
    if (['SENT', 'SIMULATED', 'DELIVERED'].includes(message.status)) return;
    try {
      const result = await this.notifier.sms(message.toPhone, message.body, message.dedupeKey);
      await this.db.smsMessage.update({
        where: { id },
        data:
          result.provider === 'console'
            ? { status: 'SIMULATED', providerRef: `console-${id}` }
            : { status: 'SENT', providerRef: result.id },
      });
    } catch (error) {
      await this.db.smsMessage.update({ where: { id }, data: { status: 'FAILED' } });
      throw error;
    }
  }
  async absence(enrollmentId: string, day: string) {
    const date = new Date(day);
    const record = await this.db.attendanceRecord.findUnique({
      where: { enrollmentId_date_period: { enrollmentId, date, period: 0 } },
      include: {
        enrollment: {
          include: {
            student: {
              include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } },
            },
          },
        },
      },
    });
    if (!record || record.status !== 'ABSENT') return;
    const s = record.enrollment.student;
    if (
      await this.db.leaveRequest.findFirst({
        where: {
          studentId: s.id,
          status: 'APPROVED',
          fromDate: { lte: date },
          toDate: { gte: date },
        },
      })
    )
      return;
    for (const g of s.guardians)
      if (g.guardian.phone) {
        await this.sms(
          s.campusId,
          g.guardian.phone,
          `${s.fullName} was marked absent on ${day}. Please contact the school.`,
          `absent-${s.id}-${day}`,
        );
        this.realtime.user(g.guardianUserId, 'attendance');
      }
  }
  /** Organisations whose scheduled work should run: active and with a usable subscription. */
  private async liveOrganizations(only?: string[]) {
    const orgs = await this.db.organization.findMany({
      where: { status: 'ACTIVE', ...(only ? { id: { in: only } } : {}) },
      select: { id: true, subscription: { select: { status: true, currentPeriodEnd: true } } },
    });
    return orgs.filter((o) => subscriptionUsable(o.subscription)).map((o) => o.id);
  }
  async notices() {
    const now = new Date();
    const live = new Set(await this.liveOrganizations());
    const notices = await this.db.notice.findMany({
      where: { status: 'SCHEDULED', OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
      include: { campus: { select: { orgId: true } } },
      take: 50,
    });
    for (const n of notices) {
      if (!live.has(n.campus.orgId)) continue;
      const audience = n.audience as { sectionIds?: string[]; studentIds?: string[] };
      const students = await this.db.student.findMany({
        where: {
          campusId: n.campusId,
          ...(audience.studentIds?.length ? { id: { in: audience.studentIds } } : {}),
          ...(audience.sectionIds?.length
            ? {
                enrollments: { some: { sectionId: { in: audience.sectionIds }, status: 'ACTIVE' } },
              }
            : {}),
        },
        include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } },
      });
      for (const s of students)
        for (const g of s.guardians) {
          if (n.channels.includes('SMS') && g.guardian.phone)
            await this.sms(
              n.campusId,
              g.guardian.phone,
              n.bodyBn || n.body,
              `notice-${n.id}-${g.guardianUserId}`,
              n.id,
            );
          this.realtime.user(g.guardianUserId, 'notice');
        }
      await this.db.notice.update({ where: { id: n.id }, data: { status: 'SENT' } });
      this.realtime.campus(n.campusId, 'notice');
    }
  }
  /**
   * Daily late fines: one set-based UPDATE per organisation using that school's policy. Fines
   * only ever grow, so re-running the job on the same day changes nothing.
   */
  async fines(only?: string[]) {
    const day = today();
    for (const orgId of await this.liveOrganizations(only)) {
      const p = await this.settings.policy(orgId);
      if (p.lateFineMode === 'NONE') continue;
      const perDay = p.lateFineMode === 'PER_DAY' ? p.lateFinePerDayMinor : 0;
      const flat = p.lateFineMode === 'FLAT' ? p.lateFineFlatMinor : 0;
      await this.db.$executeRaw`
        UPDATE "Invoice" i
        SET "fineMinor" = LEAST(${p.lateFineCapMinor}::int,
          CASE WHEN ${flat}::int > 0 THEN ${flat}::int
               ELSE (${day}::date - i."dueDate") * ${perDay}::int END)
        FROM "Student" s, "Campus" c, "AcademicSession" a
        WHERE s."id" = i."studentId" AND c."id" = s."campusId" AND c."orgId" = ${orgId}
          AND a."id" = i."sessionId" AND a."status" <> 'CLOSED'
          AND i."status" IN ('DUE', 'PARTIAL')
          AND i."dueDate" < ${day}::date
          AND i."fineMinor" < LEAST(${p.lateFineCapMinor}::int,
            CASE WHEN ${flat}::int > 0 THEN ${flat}::int
                 ELSE (${day}::date - i."dueDate") * ${perDay}::int END)`;
    }
  }
  /**
   * Bills each active fee structure once per month (any day of the month, so a missed run
   * catches up). The marker is written after generation; generation itself is idempotent.
   */
  async monthlyBilling(only?: string[]) {
    const day = today();
    const month = day.slice(0, 7);
    const live = await this.liveOrganizations(only);
    const structures = await this.db.feeStructure.findMany({
      where: {
        session: { status: 'ACTIVE', campus: { orgId: { in: live } } },
        OR: [{ lastGeneratedMonth: null }, { lastGeneratedMonth: { lt: month } }],
      },
      include: { session: { include: { campus: true } } },
    });
    for (const structure of structures) {
      const policy = await this.settings.policy(structure.session.campus.orgId);
      const dueDate = new Date(`${month}-${String(policy.invoiceDueDay).padStart(2, '0')}`);
      try {
        if (dueDate >= structure.session.startsOn && dueDate <= structure.session.endsOn)
          await this.billing.generate(structure.session.campusId, structure.id, dueDate);
        await this.db.feeStructure.update({
          where: { id: structure.id },
          data: { lastGeneratedMonth: month },
        });
        this.realtime.campus(structure.session.campusId, 'fees');
      } catch (error) {
        console.error(
          'Monthly billing failed for a fee structure',
          structure.id,
          (error as Error).message,
        );
      }
    }
  }
  async feeReminders(only?: string[]) {
    const day = today();
    for (const orgId of await this.liveOrganizations(only)) {
      const p = await this.settings.policy(orgId);
      if (!p.feeRemindersEnabled) continue;
      const dueDays = [
        day,
        new Date(Date.parse(day) + p.reminderDaysBefore * 86400000).toISOString().slice(0, 10),
      ].map((d) => new Date(d));
      const invoices = await this.db.invoice.findMany({
        where: {
          status: { in: ['DUE', 'PARTIAL'] },
          dueDate: { in: dueDays },
          session: { status: { not: 'CLOSED' } },
          student: { campus: { orgId } },
        },
        include: {
          student: {
            include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } },
          },
        },
      });
      for (const invoice of invoices)
        for (const g of invoice.student.guardians)
          if (g.guardian.phone)
            await this.sms(
              invoice.student.campusId,
              g.guardian.phone,
              `Fee reminder for ${invoice.student.fullName}: BDT ${((invoice.totalMinor + invoice.fineMinor - invoice.waivedMinor - invoice.paidMinor) / 100).toFixed(2)} due on ${invoice.dueDate.toISOString().slice(0, 10)}.`,
              `fee-reminder-${invoice.id}-${day}`,
            );
    }
  }
  async offerExpiry() {
    const now = new Date();
    const expired = await this.db.seatOffer.findMany({
      where: { status: 'OFFERED', application: { offerExpiresAt: { lt: now } } },
      include: { section: { include: { schoolClass: { include: { campus: true } } } } },
      take: 200,
    });
    for (const offer of expired) {
      const policy = await this.settings.policy(offer.section.schoolClass.campus.orgId);
      await this.db.serial(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Section" WHERE id = ${offer.sectionId} FOR UPDATE`;
        const current = await tx.seatOffer.findUniqueOrThrow({
          where: { id: offer.id },
          include: { application: true, section: true },
        });
        if (current.status !== 'OFFERED') return;
        await tx.seatOffer.update({ where: { id: offer.id }, data: { status: 'EXPIRED' } });
        await tx.admissionApplication.update({
          where: { id: offer.applicationId },
          data: { status: 'EXPIRED' },
        });
        if (
          (await tx.academicSession.findUniqueOrThrow({ where: { id: current.section.sessionId } }))
            .status === 'CLOSED'
        )
          return;
        const next = await tx.admissionApplication.findFirst({
          where: {
            applyingClassId: current.application.applyingClassId,
            sessionId: current.application.sessionId,
            status: 'WAITLISTED',
          },
          orderBy: [{ meritRank: 'asc' }, { createdAt: 'asc' }],
        });
        if (next) {
          await tx.admissionApplication.update({
            where: { id: next.id },
            data: {
              status: 'OFFERED',
              offerExpiresAt: new Date(Date.now() + policy.admissionOfferHours * 3600_000),
            },
          });
          await tx.seatOffer.upsert({
            where: { applicationId: next.id },
            create: { applicationId: next.id, sectionId: offer.sectionId },
            update: { status: 'OFFERED', sectionId: offer.sectionId },
          });
        }
      });
    }
  }
}
