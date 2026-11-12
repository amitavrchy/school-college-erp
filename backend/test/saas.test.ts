import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { removeTestTenant } from './tenant-cleanup';
const base = process.env.API_URL || 'http://localhost:4000/api';
const password = 'TenantFixture!2026';
test(
  'SaaS billing, isolation and advanced operations',
  { skip: process.env.RUN_INTEGRATION !== 'true', timeout: 120000 },
  async (t) => {
    const db = new PrismaClient();
    const created: string[] = [];
    const originalSettings = await db.platformSettings.findUniqueOrThrow({
      where: { id: 'platform' },
    });
    t.after(async () => {
      await db.platformSettings.update({
        where: { id: 'platform' },
        data: {
          bkashNumber: originalSettings.bkashNumber,
          nagadNumber: originalSettings.nagadNumber,
          bankInstructions: originalSettings.bankInstructions,
          paymentInstructions: originalSettings.paymentInstructions,
          supportEmail: originalSettings.supportEmail,
        },
      });
      for (const org of created.reverse()) await removeTestTenant(db, org);
      await db.$disconnect();
    });
    async function request(
      cookie: string,
      campus: string,
      path: string,
      body?: unknown,
      method = body === undefined ? 'GET' : 'POST',
    ) {
      const r = await fetch(`${base}/${path}`, {
        method,
        headers: { Cookie: cookie, 'x-campus-id': campus, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await r.json();
      return { status: r.status, data, cookie: r.headers.get('set-cookie')?.split(';')[0] || '' };
    }
    async function register(label: string, planCode = 'STARTER') {
      const slug = `test-${label}-${randomUUID().slice(0, 8)}`;
      const r = await request('', '', 'saas/register', {
        organizationName: `Test ${label} institution`,
        slug,
        campusName: 'Main Campus',
        planCode,
        fullName: `${label} Owner`,
        email: `${slug}@example.test`,
        password,
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      created.push(r.data.organization.id);
      const user = await db.user.findUniqueOrThrow({ where: { email: `${slug}@example.test` } });
      return { ...r.data, cookie: r.cookie, user };
    }
    const a = await register('a'),
      b = await register('b', 'GROWTH');
    const platform = await request('', '', 'auth/login', {
      email: process.env.PLATFORM_ADMIN_EMAIL || 'platform@campusone.edu.bd',
      password: process.env.PLATFORM_SEED_PASSWORD || process.env.SEED_PASSWORD || 'CampusOne!2026',
    });
    assert.equal(platform.status, 201);
    await t.test(
      'institution owners cannot cross tenant boundaries or enter platform administration',
      async () => {
        assert.equal((await request(a.cookie, b.campus.id, 'students')).status, 403);
        assert.equal((await request(a.cookie, a.campus.id, 'platform/dashboard')).status, 403);
        const campuses = await request(a.cookie, a.campus.id, 'campuses');
        assert.deepEqual(
          campuses.data.map((c: any) => c.orgId),
          [a.organization.id],
        );
        assert.equal(
          (
            await request(a.cookie, a.campus.id, 'campuses', {
              name: 'One too many',
              code: 'EXTRA',
            })
          ).status,
          402,
        );
        assert.equal((await request(a.cookie, a.campus.id, 'library/books')).status, 402);
      },
    );
    await t.test(
      'wallet references stay pending, cannot be reused, and approval extends once',
      async () => {
        const configured = await request(
          platform.cookie,
          '',
          'platform/settings',
          {
            bkashNumber: '01700000001',
            nagadNumber: '01800000001',
            paymentInstructions: 'Fixture receiving account for an automated test only.',
          },
          'PATCH',
        );
        assert.equal(configured.status, 200);
        const reference = `TEST${randomUUID().replaceAll('-', '')}`;
        const submitted = await request(a.cookie, a.campus.id, 'saas/payment-requests', {
          planId: 'plan-growth',
          period: 'MONTHLY',
          method: 'BKASH',
          reference,
          senderPhone: '01712345678',
        });
        assert.equal(submitted.status, 201);
        assert.equal(
          (
            await db.subscription.findUniqueOrThrow({
              where: { organizationId: a.organization.id },
            })
          ).status,
          'TRIAL',
        );
        assert.equal(
          (
            await request(b.cookie, b.campus.id, 'saas/payment-requests', {
              planId: 'plan-growth',
              period: 'MONTHLY',
              method: 'BKASH',
              reference: reference.toLowerCase(),
              senderPhone: '01712345678',
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request(a.cookie, a.campus.id, `platform/payments/${submitted.data.id}/review`, {
              decision: 'APPROVED',
              receivedAmountMinor: 650000,
              note: 'Not a platform administrator',
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request(platform.cookie, '', `platform/payments/${submitted.data.id}/review`, {
              decision: 'APPROVED',
              receivedAmountMinor: 1,
              note: 'Amount does not match',
            })
          ).status,
          400,
        );
        const reviews = await Promise.all(
          [1, 2].map(() =>
            request(platform.cookie, '', `platform/payments/${submitted.data.id}/review`, {
              decision: 'APPROVED',
              receivedAmountMinor: 650000,
              note: 'Automated fixture approval. No real payment.',
            }),
          ),
        );
        assert.ok(reviews.every((r) => r.status === 201));
        assert.equal(
          await db.subscriptionEvent.count({
            where: { organizationId: a.organization.id, action: 'SUBSCRIPTION_ACTIVATED' },
          }),
          1,
        );
        const sub = await db.subscription.findUniqueOrThrow({
          where: { organizationId: a.organization.id },
        });
        assert.equal(sub.planId, 'plan-growth');
        assert.ok(sub.currentPeriodEnd.getTime() < Date.now() + 35 * 86400000);
        assert.equal((await request(a.cookie, a.campus.id, 'library/books')).status, 200);
        const receipt = await fetch(`${base}/saas/payments/${submitted.data.id}/receipt`, {
          headers: { Cookie: a.cookie, 'x-campus-id': a.campus.id },
        });
        assert.equal(receipt.status, 200);
        assert.match(receipt.headers.get('content-type') || '', /application\/pdf/);
      },
    );
    await t.test('manual activation has an idempotent activation key', async () => {
      const body = {
        planId: 'plan-growth',
        period: 'YEARLY',
        amountMinor: 0,
        reason: 'Complimentary automated fixture only.',
        idempotencyKey: randomUUID(),
      };
      const r = await Promise.all(
        [1, 2].map(() =>
          request(platform.cookie, '', `platform/organizations/${b.organization.id}/grant`, body),
        ),
      );
      assert.ok(
        r.every((v) => v.status === 201),
        JSON.stringify(r),
      );
      assert.equal(
        await db.subscriptionPayment.count({
          where: { organizationId: b.organization.id, method: 'MANUAL' },
        }),
        1,
      );
    });
    const schoolClass = await db.schoolClass.create({
      data: { campusId: a.campus.id, name: 'Class 6', numericLevel: 6 },
    });
    const section = await db.section.create({
      data: { classId: schoolClass.id, sessionId: a.session.id, name: 'A', capacity: 30 },
    });
    const students = await Promise.all(
      [1, 2].map((i) =>
        db.student.create({
          data: {
            campusId: a.campus.id,
            fullName: `Fixture learner ${i}`,
            studentCode: `TEST-${i}`,
            enrollments: { create: { sectionId: section.id, sessionId: a.session.id } },
          },
        }),
      ),
    );
    const guardian = await db.user.create({
      data: {
        email: `test-guardian-${randomUUID()}@example.test`,
        fullName: 'Fixture guardian',
        passwordHash: await hash(password, 4),
        memberships: { create: { organizationId: a.organization.id, role: 'MEMBER' } },
        roles: { create: { campusId: a.campus.id, role: 'GUARDIAN' } },
        guardians: { create: { studentId: students[0].id, isPrimary: true } },
      },
    });
    const g = await request('', '', 'auth/login', { email: guardian.email, password });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
    await t.test(
      'concurrent library checkout never exceeds available stock and fines invoice once',
      async () => {
        const book = await request(a.cookie, a.campus.id, 'library/books', {
          title: 'Fixture book',
          author: 'Fixture author',
          category: 'Science',
          totalCopies: 1,
          replacementMinor: 10000,
        });
        assert.equal(book.status, 201);
        const due = new Date(Date.parse(day) + 7 * 86400000).toISOString().slice(0, 10);
        const requests = await Promise.all(
          students.map((s) =>
            request(a.cookie, a.campus.id, 'library/loans', {
              bookId: book.data.id,
              studentId: s.id,
              dueDate: due,
            }),
          ),
        );
        assert.equal(requests.filter((r) => r.status === 201).length, 1);
        assert.equal(requests.filter((r) => r.status === 409).length, 1);
        const loan = requests.find((r) => r.status === 201)!.data;
        await db.libraryLoan.update({
          where: { id: loan.id },
          data: { dueDate: new Date(Date.parse(day) - 86400000) },
        });
        const returned = await request(a.cookie, a.campus.id, `library/loans/${loan.id}/return`, {
          lost: false,
        });
        assert.equal(returned.status, 201);
        assert.equal(returned.data.fineMinor, 500);
        await request(a.cookie, a.campus.id, `library/loans/${loan.id}/return`, { lost: false });
        assert.equal(await db.invoice.count({ where: { generationKey: `library-${loan.id}` } }), 1);
        assert.equal(
          (await request(b.cookie, b.campus.id, `library/loans/${loan.id}/return`, { lost: false }))
            .status,
          404,
        );
      },
    );
    await t.test('transport capacity and boarding-before-drop-off are enforced', async () => {
      const route = await request(a.cookie, a.campus.id, 'transport/routes', {
        name: 'Fixture route',
        vehicleNumber: 'TEST-VEHICLE',
        driverName: 'Fixture driver',
        driverPhone: '01712345678',
        capacity: 1,
        monthlyMinor: 10000,
      });
      assert.equal(route.status, 201);
      const stop = await request(a.cookie, a.campus.id, `transport/routes/${route.data.id}/stops`, {
        name: 'Fixture stop',
        pickupTime: '07:00',
        dropTime: '15:00',
        sequence: 1,
      });
      const attempts = await Promise.all(
        students.map((s) =>
          request(a.cookie, a.campus.id, 'transport/assignments', {
            routeId: route.data.id,
            stopId: stop.data.id,
            studentId: s.id,
            sessionId: a.session.id,
          }),
        ),
      );
      assert.equal(attempts.filter((r) => r.status === 201).length, 1);
      const assigned = attempts.find((r) => r.status === 201)!.data;
      const body = { assignmentId: assigned.id, date: day, journey: 'MORNING', status: 'DROPPED' };
      assert.equal((await request(a.cookie, a.campus.id, 'transport/trips', body)).status, 400);
      assert.equal(
        (await request(a.cookie, a.campus.id, 'transport/trips', { ...body, status: 'BOARDED' }))
          .status,
        201,
      );
      assert.equal((await request(a.cookie, a.campus.id, 'transport/trips', body)).status, 201);
      assert.equal(
        (await request(a.cookie, a.campus.id, 'transport/trips', { ...body, status: 'ABSENT' }))
          .status,
        409,
      );
      await request(a.cookie, a.campus.id, 'transport/bill', {
        sessionId: a.session.id,
        dueDate: day,
      });
      await request(a.cookie, a.campus.id, 'transport/bill', {
        sessionId: a.session.id,
        dueDate: day,
      });
      assert.equal(
        await db.invoice.count({
          where: {
            generationKey: { startsWith: 'transport-' },
            student: { campusId: a.campus.id },
          },
        }),
        1,
      );
    });
    await t.test('homework submissions and support conversations stay private', async () => {
      const subject = await db.subject.create({
        data: { campusId: a.campus.id, name: 'English', code: 'ENG' },
      });
      const hw = await request(a.cookie, a.campus.id, 'homework', {
        sectionId: section.id,
        subjectId: subject.id,
        title: 'Fixture assignment',
        instructions: 'Write a useful response for this fixture assignment.',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        maxPoints: 100,
      });
      assert.equal(hw.status, 201);
      const submission = await request(g.cookie, a.campus.id, `homework/${hw.data.id}/submit`, {
        studentId: students[0].id,
        answer: 'A complete fixture answer from the linked learner.',
      });
      assert.equal(submission.status, 201);
      assert.equal(
        (
          await request(g.cookie, a.campus.id, `homework/${hw.data.id}/submit`, {
            studentId: students[1].id,
            answer: 'This learner is not linked to the guardian.',
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await request(a.cookie, a.campus.id, `homework/submissions/${submission.data.id}/grade`, {
            points: 85,
            feedback: 'Thoughtful fixture work.',
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await request(g.cookie, a.campus.id, `homework/${hw.data.id}/submit`, {
            studentId: students[0].id,
            answer: 'An attempt to overwrite a graded answer.',
          })
        ).status,
        409,
      );
      const ticket = await request(g.cookie, a.campus.id, 'support/tickets', {
        title: 'Fixture support question',
        category: 'ACADEMIC',
        priority: 'NORMAL',
        body: 'A detailed fixture support question for the institution.',
      });
      assert.equal(ticket.status, 201);
      assert.equal(
        (
          await request(b.cookie, b.campus.id, `support/tickets/${ticket.data.id}/comments`, {
            body: 'Cross-tenant reply',
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await request(a.cookie, a.campus.id, `support/tickets/${ticket.data.id}/comments`, {
            body: 'An authorized campus response.',
          })
        ).status,
        201,
      );
    });
    await t.test('expired subscriptions preserve reads and block operational writes', async () => {
      await db.subscription.update({
        where: { organizationId: a.organization.id },
        data: { currentPeriodEnd: new Date(Date.now() - 86400000) },
      });
      assert.equal((await request(a.cookie, a.campus.id, 'students')).status, 200);
      assert.equal(
        (await request(a.cookie, a.campus.id, 'classes', { name: 'Class 7', numericLevel: 7 }))
          .status,
        402,
      );
      assert.equal((await request(a.cookie, a.campus.id, 'saas/me')).status, 200);
      assert.equal((await request(a.cookie, a.campus.id, 'library/books')).status, 402);
    });
  },
);
