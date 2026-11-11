import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Db } from './db';
import { config } from './config';
import { today } from './common';
import { lateFine } from './domain/fees';
import { Realtime } from './realtime';
import { Billing } from './modules/billing';
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
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Realtime) private realtime: Realtime,
    @Inject(Billing) private billing: Billing,
  ) {}
  async onModuleInit() {
    this.worker = new Worker(
      'campus-work',
      async (job) => {
        if (job.name === 'sms') return this.sendSms(job.data.id);
        if (job.name === 'absence') return this.absence(job.data.enrollmentId, job.data.date);
        if (job.name === 'maintenance') return this.maintenance();
      },
      { connection: this.connection as any, concurrency: 4 },
    );
    this.worker.on('failed', (job, error) =>
      console.error('Background job failed', job?.id, error.message),
    );
    await this.queue.upsertJobScheduler(
      'maintenance',
      { every: 60_000 },
      { name: 'maintenance', data: {} },
    );
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
    const message = await this.db.smsMessage.upsert({
      where: { dedupeKey },
      create: { campusId, toPhone, body, dedupeKey, noticeId },
      update: {},
    });
    if (['QUEUED', 'FAILED'].includes(message.status))
      await this.queue.add('sms', { id: message.id }, { jobId: `sms-${message.id}` });
  }
  async sendSms(id: string) {
    const message = await this.db.smsMessage.findUniqueOrThrow({ where: { id } });
    if (['SENT', 'SIMULATED', 'DELIVERED'].includes(message.status)) return;
    try {
      if (config.SMS_PROVIDER === 'console') {
        await this.db.smsMessage.update({
          where: { id },
          data: { status: 'SIMULATED', providerRef: `console-${id}` },
        });
        return;
      }
      if (!process.env.SMS_API_URL || !process.env.SMS_API_KEY)
        throw new Error('SMS gateway is not configured');
      const response = await fetch(process.env.SMS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SMS_API_KEY}`,
          'Idempotency-Key': message.dedupeKey,
        },
        body: JSON.stringify({
          to: message.toPhone,
          body: message.body,
          sender: process.env.SMS_SENDER_ID,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
      const result = (await response.json()) as { id: string };
      if (!result.id) throw new Error('SMS response missing message ID');
      await this.db.smsMessage.update({
        where: { id },
        data: { status: 'SENT', providerRef: result.id },
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
  async maintenance() {
    const now = new Date();
    const notices = await this.db.notice.findMany({
      where: { status: 'SCHEDULED', OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
    });
    for (const n of notices) {
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
    const invoices = await this.db.invoice.findMany({
      where: { status: { in: ['DUE', 'PARTIAL'] }, session: { status: { not: 'CLOSED' } } },
    });
    for (const invoice of invoices) {
      const fineMinor = lateFine(
        invoice.dueDate,
        now,
        Number(process.env.FEE_FINE_PER_DAY_MINOR || 1000),
        50000,
      );
      if (fineMinor > invoice.fineMinor)
        await this.db.invoice.updateMany({
          where: {
            id: invoice.id,
            status: { in: ['DUE', 'PARTIAL'] },
            session: { status: { not: 'CLOSED' } },
            fineMinor: { lt: fineMinor },
          },
          data: { fineMinor },
        });
    }
    const day = today();
    if (day.endsWith('-01')) {
      const structures = await this.db.feeStructure.findMany({
        where: { session: { status: 'ACTIVE' } },
        include: { session: true },
      });
      for (const structure of structures)
        await this.billing.generate(
          structure.session.campusId,
          structure.id,
          new Date(`${day.slice(0, 7)}-10`),
        );
    }
    if (process.env.FEE_REMINDERS_ENABLED === 'true') {
      const dueDays = [day, new Date(Date.parse(day) + 3 * 86400000).toISOString().slice(0, 10)];
      for (const invoice of invoices.filter((i) =>
        dueDays.includes(i.dueDate.toISOString().slice(0, 10)),
      )) {
        const s = await this.db.student.findUniqueOrThrow({
          where: { id: invoice.studentId },
          include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } },
        });
        for (const g of s.guardians)
          if (g.guardian.phone)
            await this.sms(
              s.campusId,
              g.guardian.phone,
              `Fee reminder for ${s.fullName}: BDT ${((invoice.totalMinor + invoice.fineMinor - invoice.waivedMinor - invoice.paidMinor) / 100).toFixed(2)} due on ${invoice.dueDate.toISOString().slice(0, 10)}.`,
              `fee-reminder-${invoice.id}-${day}`,
            );
      }
    }
    const expired = await this.db.seatOffer.findMany({
      where: { status: 'OFFERED', application: { offerExpiresAt: { lt: now } } },
    });
    for (const offer of expired)
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
            data: { status: 'OFFERED', offerExpiresAt: new Date(Date.now() + 48 * 3600_000) },
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
