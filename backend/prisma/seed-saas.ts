import type { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PLAN_SEEDS } from '../src/saas/policy';
export async function seedSaas(db: PrismaClient, password: string) {
  for (const plan of PLAN_SEEDS)
    await db.subscriptionPlan.upsert({ where: { code: plan.code }, create: plan, update: {} });
  await db.platformSettings.upsert({
    where: { id: 'platform' },
    create: { id: 'platform' },
    update: {},
  });
  await db.user.upsert({
    where: { id: 'platform-owner' },
    create: {
      id: 'platform-owner',
      email: process.env.PLATFORM_ADMIN_EMAIL || 'platform@campusone.edu.bd',
      fullName: 'Campus One Platform',
      passwordHash: await hash(process.env.PLATFORM_SEED_PASSWORD || password, 12),
      platformAdmin: true,
    },
    update: { platformAdmin: true },
  });
  await db.organization.updateMany({
    where: { id: 'org-scholars', slug: null },
    data: { slug: 'scholars' },
  });
  const campuses = await db.campus.findMany({ where: { orgId: 'org-scholars' } });
  const roles = await db.userCampusRole.findMany({
    where: { campusId: { in: campuses.map((c) => c.id) } },
  });
  for (const r of roles)
    await db.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: 'org-scholars', userId: r.userId } },
      create: {
        organizationId: 'org-scholars',
        userId: r.userId,
        role: r.userId === 'admin' ? 'OWNER' : 'MEMBER',
      },
      update: {},
    });
  await db.subscription.upsert({
    where: { organizationId: 'org-scholars' },
    create: {
      organizationId: 'org-scholars',
      planId: 'plan-scale',
      status: 'ACTIVE',
      period: 'YEARLY',
      currentPeriodEnd: new Date(Date.now() + 365 * 86400000),
    },
    update: {},
  });
  for (const campus of campuses) {
    const students = await db.student.findMany({
      where: { campusId: campus.id },
      orderBy: { studentCode: 'asc' },
      take: 2,
      include: { enrollments: { where: { status: 'ACTIVE' }, include: { section: true } } },
    });
    if (!students.length) continue;
    for (const [i, title, author, category] of [
      [1, 'The Wonder of Science', 'M. Zafar Iqbal', 'Science'],
      [2, 'A Brief History of Time', 'Stephen Hawking', 'Science'],
      [3, 'The Story of Bangladesh', 'Muhammad Habibur Rahman', 'History'],
      [4, 'Introduction to Algebra', 'Richard Rusczyk', 'Mathematics'],
    ] as const) {
      await db.libraryBook.upsert({
        where: { id: `${campus.id}-book-${i}` },
        create: {
          id: `${campus.id}-book-${i}`,
          campusId: campus.id,
          title,
          author,
          category,
          shelf: `B-${i}`,
          totalCopies: 3,
          replacementMinor: 60000,
        },
        update: {},
      });
    }
    await db.libraryLoan.upsert({
      where: { id: `${campus.id}-loan-1` },
      create: {
        id: `${campus.id}-loan-1`,
        bookId: `${campus.id}-book-1`,
        studentId: students[0].id,
        issuedBy: 'teacher',
        dueDate: new Date(Date.now() + 7 * 86400000),
      },
      update: {},
    });
    const routeId = `${campus.id}-route-1`;
    await db.transportRoute.upsert({
      where: { id: routeId },
      create: {
        id: routeId,
        campusId: campus.id,
        name: 'Green route · North loop',
        vehicleNumber: `Dhaka Metro Cha 11-${campus.code}`,
        driverName: 'Abdul Karim',
        driverPhone: '01712345678',
        capacity: 24,
        monthlyMinor: 120000,
      },
      update: {},
    });
    for (const [sequence, name, pickupTime, dropTime] of [
      [1, 'Community park', '07:00', '15:30'],
      [2, 'Main road junction', '07:15', '15:15'],
      [3, 'Campus gate', '07:30', '15:00'],
    ] as const)
      await db.transportStop.upsert({
        where: { id: `${routeId}-stop-${sequence}` },
        create: {
          id: `${routeId}-stop-${sequence}`,
          routeId,
          name,
          pickupTime,
          dropTime,
          sequence,
        },
        update: {},
      });
    const e = students[0].enrollments[0];
    if (!e) continue;
    await db.studentTransport.upsert({
      where: { studentId_sessionId: { studentId: students[0].id, sessionId: e.sessionId } },
      create: {
        studentId: students[0].id,
        sessionId: e.sessionId,
        routeId,
        stopId: `${routeId}-stop-1`,
      },
      update: {},
    });
    await db.homework.upsert({
      where: { id: `${campus.id}-homework-1` },
      create: {
        id: `${campus.id}-homework-1`,
        sectionId: e.sectionId,
        subjectId: `${campus.id}-ENG`,
        teacherId: 'teacher',
        title: 'A letter to your future self',
        instructions:
          'Write a thoughtful letter to your future self about the person you hope to become. Include three goals and explain one small action you can take toward each goal this week.',
        dueAt: new Date(Date.now() + 7 * 86400000),
        maxPoints: 100,
        allowLate: true,
      },
      update: {},
    });
    await db.supportTicket.upsert({
      where: { id: `${campus.id}-ticket-1` },
      create: {
        id: `${campus.id}-ticket-1`,
        organizationId: campus.orgId,
        campusId: campus.id,
        createdById: 'guardian',
        title: 'Please clarify the upcoming parent meeting',
        category: 'ACADEMIC',
        priority: 'NORMAL',
        slaDueAt: new Date(Date.now() + 72 * 3600000),
        comments: {
          create: {
            authorId: 'guardian',
            body: 'Could you please confirm whether the parent meeting includes a discussion of the annual examination plan?',
          },
        },
      },
      update: {},
    });
  }
}
