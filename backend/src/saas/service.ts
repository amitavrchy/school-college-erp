import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { Db } from '../db';
import type { Context } from '../auth/access';
import { extendPeriod } from './policy';
import { NCTB } from '../domain/grading';
@Injectable()
export class Saas {
  constructor(@Inject(Db) private db: Db) {}
  async owner(ctx: Context) {
    const member = await this.db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: ctx.orgId, userId: ctx.userId } },
    });
    if (!member || !['OWNER', 'ADMIN'].includes(member.role))
      throw new ForbiddenException(
        'Organization owner or billing administrator access is required',
      );
    return member;
  }
  async onboard(
    input: {
      organizationName: string;
      slug: string;
      campusName: string;
      planCode: string;
      period?: string;
      fullName?: string;
      email?: string;
      password?: string;
    },
    existingUserId?: string,
  ) {
    const passwordHash = input.password ? await hash(input.password, 12) : undefined;
    return this.db.serial(async (tx) => {
      const plan = await tx.subscriptionPlan.findFirstOrThrow({
        where: { code: input.planCode, active: true },
      });
      const user = existingUserId
        ? await tx.user.findUniqueOrThrow({ where: { id: existingUserId } })
        : await tx.user.create({
            data: { fullName: input.fullName!, email: input.email!, passwordHash: passwordHash! },
          });
      const org = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug: input.slug,
          members: { create: { userId: user.id, role: 'OWNER' } },
          subscription: {
            create: {
              planId: plan.id,
              period: input.period || 'MONTHLY',
              status: 'TRIAL',
              currentPeriodEnd: new Date(Date.now() + 14 * 86400000),
            },
          },
        },
      });
      const campus = await tx.campus.create({
        data: {
          orgId: org.id,
          name: input.campusName,
          code: 'MAIN',
          roles: { create: { userId: user.id, role: 'SUPER_ADMIN' } },
        },
      });
      const year = Number(
        new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Dhaka' }).format(
          new Date(),
        ),
      );
      const session = await tx.academicSession.create({
        data: {
          campusId: campus.id,
          name: `${year} Academic Year`,
          startsOn: new Date(`${year}-01-01`),
          endsOn: new Date(`${year}-12-31`),
          status: 'ACTIVE',
        },
      });
      await tx.gradeScale.createMany({ data: NCTB.map((g) => ({ ...g, campusId: campus.id })) });
      await tx.subscriptionEvent.create({
        data: {
          organizationId: org.id,
          actorId: user.id,
          action: 'TRIAL_STARTED',
          meta: { planCode: plan.code, days: 14 },
        },
      });
      return { user, organization: org, campus, session };
    });
  }
  usage(organizationId: string) {
    return Promise.all([
      this.db.campus.count({ where: { orgId: organizationId } }),
      this.db.student.count({ where: { campus: { orgId: organizationId } } }),
      this.db.user.count({
        where: {
          roles: {
            some: { campus: { orgId: organizationId }, role: { notIn: ['GUARDIAN', 'STUDENT'] } },
          },
        },
      }),
      this.db.admissionDocument.aggregate({
        where: { application: { session: { campus: { orgId: organizationId } } } },
        _sum: { size: true },
      }),
    ]).then(([campuses, students, staff, documents]) => ({
      campuses,
      students,
      staff,
      documentBytes: documents._sum.size || 0,
    }));
  }
  async summary(ctx: Context) {
    await this.owner(ctx);
    const [organization, usage, payments, events, settings] = await Promise.all([
      this.db.organization.findUniqueOrThrow({
        where: { id: ctx.orgId },
        include: { subscription: { include: { plan: true } } },
      }),
      this.usage(ctx.orgId),
      this.db.subscriptionPayment.findMany({
        where: { organizationId: ctx.orgId },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.subscriptionEvent.findMany({
        where: { organizationId: ctx.orgId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.db.platformSettings.findUnique({ where: { id: 'platform' } }),
    ]);
    return { organization, usage, payments, events, paymentSettings: settings };
  }
  async activate(
    tx: Prisma.TransactionClient,
    orgId: string,
    planId: string,
    period: string,
    actorId: string,
    paymentId: string,
  ) {
    const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { id: planId } });
    const [campuses, students, staff] = await Promise.all([
      tx.campus.count({ where: { orgId } }),
      tx.student.count({ where: { campus: { orgId } } }),
      tx.user.count({
        where: { roles: { some: { campus: { orgId }, role: { notIn: ['GUARDIAN', 'STUDENT'] } } } },
      }),
    ]);
    if (campuses > plan.maxCampuses || students > plan.maxStudents || staff > plan.maxStaff)
      throw new BadRequestException(
        'This organization exceeds the selected plan limits. Select a suitable plan.',
      );
    const current = await tx.subscription.findUnique({ where: { organizationId: orgId } });
    const now = new Date();
    const from =
      current?.status === 'ACTIVE' && current.currentPeriodEnd > now
        ? current.currentPeriodEnd
        : now;
    const end = extendPeriod(from, period);
    const sub = await tx.subscription.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        planId,
        period,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
      update: { planId, period, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: end },
    });
    await tx.subscriptionEvent.create({
      data: {
        organizationId: orgId,
        actorId,
        action: 'SUBSCRIPTION_ACTIVATED',
        meta: { paymentId, planCode: plan.code, period, endsAt: end.toISOString() },
      },
    });
    return sub;
  }
  async review(
    paymentId: string,
    actorId: string,
    decision: 'APPROVED' | 'REJECTED',
    receivedAmountMinor: number | undefined,
    note: string,
  ) {
    const payment = await this.db.subscriptionPayment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${payment.organizationId} FOR UPDATE`;
      const current = await tx.subscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } });
      if (current.status === decision) return current;
      if (current.status !== 'PENDING')
        throw new ConflictException('This payment has already been reviewed');
      if (decision === 'APPROVED' && receivedAmountMinor !== current.amountMinor)
        throw new BadRequestException('Confirm the exact amount actually received before approval');
      if (decision === 'APPROVED')
        await this.activate(
          tx,
          current.organizationId,
          current.planId,
          current.period,
          actorId,
          paymentId,
        );
      else
        await tx.subscriptionEvent.create({
          data: {
            organizationId: current.organizationId,
            actorId,
            action: 'PAYMENT_REJECTED',
            meta: { paymentId, note },
          },
        });
      return tx.subscriptionPayment.update({
        where: { id: paymentId },
        data: { status: decision, reviewedBy: actorId, reviewNote: note, reviewedAt: new Date() },
      });
    });
  }
  async grant(
    organizationId: string,
    actorId: string,
    v: {
      planId: string;
      period: string;
      amountMinor: number;
      reason: string;
      idempotencyKey: string;
    },
  ) {
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
      await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
      const reference = `GRANT-${v.idempotencyKey}`;
      const existing = await tx.subscriptionPayment.findUnique({
        where: { method_reference: { method: 'MANUAL', reference } },
      });
      if (existing) {
        if (
          existing.organizationId !== organizationId ||
          existing.planId !== v.planId ||
          existing.period !== v.period ||
          existing.amountMinor !== v.amountMinor
        )
          throw new ConflictException('Activation key was used for a different subscription');
        return tx.subscription.findUniqueOrThrow({ where: { organizationId } });
      }
      const payment = await tx.subscriptionPayment.create({
        data: {
          organizationId,
          planId: v.planId,
          period: v.period,
          amountMinor: v.amountMinor,
          method: 'MANUAL',
          reference,
          status: 'APPROVED',
          submittedBy: actorId,
          reviewedBy: actorId,
          reviewNote: v.reason,
          reviewedAt: new Date(),
        },
      });
      return this.activate(tx, organizationId, v.planId, v.period, actorId, payment.id);
    });
  }
}
