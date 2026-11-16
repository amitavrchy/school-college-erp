import type { Prisma, Subscription, SubscriptionPlan } from '@prisma/client';
import { Db } from '../db';
import { Notifier } from '../notify';
import { config } from '../config';

/** Snapshot the price when the invoice is issued, rather than when payment is reviewed. */
export async function issueInvoice(
  tx: Prisma.TransactionClient,
  sub: Subscription,
  plan: SubscriptionPlan,
  period = sub.period,
) {
  const key = {
    organizationId: sub.organizationId,
    dueDate: sub.currentPeriodEnd,
    planId: plan.id,
    period,
  };
  return tx.subscriptionInvoice.upsert({
    where: { organizationId_dueDate_planId_period: key },
    create: { ...key, amountMinor: period === 'YEARLY' ? plan.annualMinor : plan.monthlyMinor },
    update: {},
  });
}

/** A run can be repeated: each recipient and milestone is recorded for the period. */
export async function subscriptionLifecycle(
  db: Db,
  notifier: Notifier,
  now = new Date(),
  onlyOrganizationId?: string,
) {
  const candidates = await db.subscription.findMany({
    where: {
      ...(onlyOrganizationId ? { organizationId: onlyOrganizationId } : {}),
      status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED'] },
      currentPeriodEnd: { lte: new Date(now.getTime() + 7 * 86400000) },
    },
    select: { organizationId: true },
  });
  for (const { organizationId } of candidates) {
    try {
      await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
          const sub = await tx.subscription.findUnique({
            where: { organizationId },
            include: {
              plan: true,
              organization: {
                include: {
                  members: {
                    where: {
                      active: true,
                      role: { in: ['OWNER', 'ADMIN'] },
                      user: { active: true },
                    },
                    include: { user: true },
                  },
                },
              },
            },
          });
          if (!sub || !['TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED'].includes(sub.status)) return;
          const remaining = sub.currentPeriodEnd.getTime() - now.getTime();
          if (remaining > 7 * 86400000) return;
          await issueInvoice(tx, sub, sub.plan);
          const status =
            sub.status === 'EXPIRED'
              ? 'EXPIRED'
              : remaining <= -config.SUBSCRIPTION_GRACE_DAYS * 86400000
                ? 'EXPIRED'
                : remaining <= 0
                  ? 'PAST_DUE'
                  : sub.status;
          if (status !== sub.status) {
            await tx.subscription.update({ where: { id: sub.id }, data: { status } });
            await tx.subscriptionEvent.create({
              data: {
                organizationId,
                actorId: 'SYSTEM',
                action: `SUBSCRIPTION_${status}`,
                meta: { periodEnd: sub.currentPeriodEnd.toISOString() },
              },
            });
          }
          // Catch up to the latest applicable milestone after downtime, without sending stale reminders.
          const kind =
            remaining <= 0
              ? 'GRACE'
              : remaining <= 86400000
                ? '1_DAY'
                : remaining <= 3 * 86400000
                  ? '3_DAYS'
                  : '7_DAYS';
          for (const member of sub.organization.members) {
            const email = member.user.email;
            if (!email) continue;
            const key = {
              organizationId,
              periodEnd: sub.currentPeriodEnd,
              kind,
              userId: member.userId,
            };
            if (
              await tx.subscriptionReminder.findUnique({
                where: { organizationId_periodEnd_kind_userId: key },
              })
            )
              continue;
            const message =
              kind === 'GRACE'
                ? `Your subscription is past due. Please renew before the grace period ends.`
                : `Your subscription ends on ${sub.currentPeriodEnd.toISOString().slice(0, 10)}. Please arrange renewal.`;
            try {
              await notifier.email(
                email,
                'Campus One subscription renewal',
                `${message} Open Subscription & Billing to view your invoice.`,
                `subscription-${organizationId}-${sub.currentPeriodEnd.getTime()}-${kind}-${member.userId}`,
              );
              await tx.subscriptionReminder.create({ data: key });
            } catch (error) {
              console.error(
                'Subscription reminder delivery failed',
                organizationId,
                member.userId,
                error,
              );
            }
          }
        },
        { timeout: 60000 },
      );
    } catch (error) {
      console.error('Subscription lifecycle failed for organization', organizationId, error);
    }
  }
}
