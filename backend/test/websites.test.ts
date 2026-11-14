import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { removeTestTenant } from './tenant-cleanup';
const base = process.env.API_URL || 'http://localhost:4000/api';
test(
  'school CMS, public results and host isolation',
  { skip: process.env.RUN_INTEGRATION !== 'true', timeout: 120000 },
  async (t) => {
    const db = new PrismaClient(),
      ids: string[] = [];
    t.after(async () => {
      for (const id of ids.reverse()) await removeTestTenant(db, id);
      await db.$disconnect();
    });
    async function request(
      path: string,
      body?: unknown,
      cookie = '',
      campus = '',
      method = body === undefined ? 'GET' : 'POST',
      origin?: string,
    ) {
      const r = await fetch(base + '/' + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          'x-campus-id': campus,
          ...(origin ? { Origin: origin } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await r.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return { status: r.status, data, cookie: r.headers.get('set-cookie')?.split(';')[0] || '' };
    }
    async function institution(label: string) {
      const slug = 'test-cms-' + label + '-' + randomUUID().slice(0, 8);
      const code = await request('auth/codes', {
        purpose: 'SIGNUP',
        contact: slug + '@example.test',
      });
      assert.equal(code.status, 201, 'API must run with OTP_DEBUG=true for integration tests');
      const r = await request('saas/register', {
        code: code.data.debugCode,
        organizationName: 'CMS ' + label + ' Academy',
        slug,
        campusName: 'Main campus',
        planCode: 'STARTER',
        fullName: 'CMS Owner',
        email: slug + '@example.test',
        password: 'CmsFixture!2026Strong',
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      ids.push(r.data.organization.id);
      return { ...r.data, cookie: r.cookie, slug };
    }
    const a = await institution('a'),
      b = await institution('b');
    const auth = (path: string, body?: unknown, method?: string) =>
      request(path, body, a.cookie, a.campus.id, method);
    let draft: any,
      rev = 1,
      original: any,
      preview = '';
    await t.test(
      'CMS creation and all mutation IDs stay within the selected institution',
      async () => {
        assert.equal((await auth('website', { subdomain: b.slug })).status, 409);
        const created = await auth('website', { subdomain: a.slug });
        assert.equal(created.status, 201);
        draft = created.data.draft;
        assert.equal(
          (await request('website', { subdomain: b.slug }, b.cookie, b.campus.id)).status,
          201,
        );
        assert.equal((await request('website')).status, 401);
        assert.equal(
          (await auth('website/domains', { hostname: 'https://wrong.example' })).status,
          400,
        );
        const teacher = await db.user.create({
          data: {
            email: randomUUID() + '@example.test',
            fullName: 'Teacher editor fixture',
            passwordHash: (
              await db.user.findUniqueOrThrow({ where: { email: a.slug + '@example.test' } })
            ).passwordHash,
            memberships: { create: { organizationId: a.organization.id, role: 'MEMBER' } },
            roles: { create: { campusId: a.campus.id, role: 'TEACHER' } },
          },
        });
        const login = await request('auth/login', {
          email: teacher.email,
          password: 'CmsFixture!2026Strong',
        });
        assert.equal((await request('website', undefined, login.cookie, a.campus.id)).status, 403);
      },
    );
    await t.test(
      'drafts, media signatures, preview capabilities and optimistic version checks',
      async () => {
        const invalid = await auth('website/assets', {
          fileName: 'x.svg',
          mimeType: 'image/png',
          base64: Buffer.from('<svg/>').toString('base64'),
        });
        assert.equal(invalid.status, 400);
        const asset = await auth('website/assets', {
          fileName: 'school.png',
          mimeType: 'image/png',
          base64:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
        });
        assert.equal(asset.status, 201);
        const media = await fetch(base.replace(/\/api$/, '') + asset.data.url);
        assert.equal(media.status, 200);
        assert.equal(media.headers.get('cross-origin-resource-policy'), 'cross-origin');
        draft.logoUrl = asset.data.url;
        draft.name = 'Cedar CMS Academy';
        draft.resultsEnabled = true;
        draft.posts = [
          {
            id: randomUUID(),
            slug: 'welcome',
            title: 'Welcome to our school',
            body: 'A published announcement.',
            category: 'NEWS',
            pinned: true,
            publishAt: new Date(Date.now() - 60000).toISOString(),
            expiresAt: null,
            eventDate: null,
            attachmentUrl: '',
          },
          {
            id: randomUUID(),
            slug: 'future',
            title: 'Scheduled future announcement',
            body: 'Not yet public',
            category: 'NEWS',
            pinned: false,
            publishAt: new Date(Date.now() + 86400000).toISOString(),
            expiresAt: null,
            eventDate: null,
            attachmentUrl: '',
          },
          {
            id: randomUUID(),
            slug: 'expired',
            title: 'Expired announcement',
            body: 'No longer public',
            category: 'NOTICE',
            pinned: false,
            publishAt: new Date(Date.now() - 86400000).toISOString(),
            expiresAt: new Date(Date.now() - 60000).toISOString(),
            eventDate: null,
            attachmentUrl: '',
          },
        ];
        const saved = await auth('website/draft', { revision: rev, content: draft }, 'PATCH');
        assert.equal(saved.status, 200);
        rev = saved.data.revision;
        assert.equal(
          (await auth('website/assets/' + asset.data.id, undefined, 'DELETE')).status,
          400,
        );
        assert.equal(
          (await auth('website/draft', { revision: 1, content: draft }, 'PATCH')).status,
          409,
        );
        assert.equal((await request('public-websites/' + a.slug)).status, 404);
        const p = await auth('website/preview', {});
        preview = new URL(p.data.url, 'http://localhost').searchParams.get('preview')!;
        assert.equal(
          (await request('public-websites/' + a.slug + '?preview=' + preview)).status,
          200,
        );
        assert.equal(
          (await request('public-websites/' + b.slug + '?preview=' + preview)).status,
          403,
        );
        const pub = await auth('website/publish', { revision: rev });
        assert.equal(pub.status, 201);
        const site = await request('public-websites/' + a.slug);
        assert.equal(site.status, 200);
        assert.deepEqual(
          site.data.content.posts.map((p: any) => p.slug),
          ['welcome'],
        );
        original = structuredClone(draft);
      },
    );
    await t.test(
      'restoring a version changes only the draft, and unchanged versions can be republished',
      async () => {
        draft.name = 'Changed draft title';
        const saved = await auth('website/draft', { revision: rev, content: draft }, 'PATCH');
        rev = saved.data.revision;
        assert.equal(
          (await request('public-websites/' + a.slug)).data.content.name,
          'Cedar CMS Academy',
        );
        await auth('website/publish', { revision: rev });
        const state = await auth('website');
        const old = state.data.site.revisions.find((v: any) => v.version === 2);
        assert.equal(
          (
            await request(
              'website/restore',
              { revision: 1, revisionId: old.id },
              b.cookie,
              b.campus.id,
            )
          ).status,
          404,
        );
        const restored = await auth('website/restore', { revision: rev, revisionId: old.id });
        assert.equal(restored.status, 201);
        rev = restored.data.revision;
        draft = restored.data.draft;
        assert.equal(
          (await request('public-websites/' + a.slug)).data.content.name,
          'Changed draft title',
        );
        await auth('website/publish', { revision: rev });
        await auth('website/unpublish', {});
        assert.equal((await request('public-websites/' + a.slug)).status, 404);
        assert.equal((await auth('website/publish', { revision: rev })).status, 201);
      },
    );
    const cls = await db.schoolClass.create({
      data: { campusId: a.campus.id, name: 'Class 7', numericLevel: 7 },
    });
    const section = await db.section.create({
      data: { classId: cls.id, sessionId: a.session.id, name: 'A' },
    });
    const student = await db.student.create({
      data: {
        campusId: a.campus.id,
        studentCode: 'CMS-001',
        fullName: 'Eliza Khan',
        dob: new Date('2011-05-10'),
      },
    });
    const enrollment = await db.enrollment.create({
      data: {
        studentId: student.id,
        sessionId: a.session.id,
        sectionId: section.id,
        rollNumber: '17',
      },
    });
    const subject = await db.subject.create({
      data: { campusId: a.campus.id, name: 'Mathematics', code: 'MATH' },
    });
    const term = await db.examTerm.create({
      data: { sessionId: a.session.id, name: 'Annual examination', status: 'PUBLISHED' },
    });
    const locked = await db.examTerm.create({
      data: { sessionId: a.session.id, name: 'Unpublished examination', status: 'ENTRY_OPEN' },
    });
    const otherTerm = await db.examTerm.create({
      data: { sessionId: b.session.id, name: 'Another school result', status: 'PUBLISHED' },
    });
    await db.examMark.create({
      data: {
        termId: term.id,
        enrollmentId: enrollment.id,
        subjectId: subject.id,
        marksObtained: 85,
        maxMarks: 100,
      },
    });
    let resultToken = '';
    await t.test(
      'roll results require correct details and reveal only published, school-scoped marks',
      async () => {
        const input = {
          termId: term.id,
          sectionId: section.id,
          rollNumber: '17',
          dob: '2011-05-10',
        };
        assert.equal(
          (await request('public-websites/' + a.slug + '/results', { ...input, dob: undefined }))
            .status,
          404,
        );
        assert.equal(
          (await request('public-websites/' + a.slug + '/results', { ...input, dob: '2011-05-11' }))
            .status,
          404,
        );
        assert.equal(
          (
            await request('public-websites/' + a.slug + '/results', {
              ...input,
              termId: otherTerm.id,
            })
          ).status,
          404,
        );
        assert.equal(
          (await request('public-websites/' + a.slug + '/results', { ...input, termId: locked.id }))
            .status,
          404,
        );
        assert.equal(
          (
            await request(
              'public-websites/' + a.slug + '/results',
              input,
              '',
              '',
              'POST',
              'https://attacker.example',
            )
          ).status,
          403,
        );
        const found = await request('public-websites/' + a.slug + '/results', input);
        assert.equal(found.status, 201);
        assert.equal(found.data.gpa, 5);
        assert.equal(found.data.marks[0].grade, 'A+');
        assert.equal(found.data.studentName, 'Eliza Khan');
        for (const key of ['dob', 'studentId', 'guardians', 'phone', 'email'])
          assert.equal(key in found.data, false);
        resultToken = new URL(found.data.downloadUrl, 'http://localhost').searchParams.get(
          'token',
        )!;
        const pdf = await fetch(
          base + '/public-websites/' + a.slug + '/results/report?token=' + resultToken,
        );
        assert.equal(pdf.status, 200);
        assert.equal(
          Buffer.from(await pdf.arrayBuffer())
            .subarray(0, 5)
            .toString(),
          '%PDF-',
        );
        assert.equal(
          (await request('public-websites/' + b.slug + '/results/report?token=' + resultToken))
            .status,
          403,
        );
        assert.equal(
          (await request('public-websites/' + a.slug + '/results/report?token=' + preview)).status,
          403,
        );
        draft.resultAccess = 'ROLL_ONLY';
        draft.rollOnlyConsent = false;
        assert.equal(
          (await auth('website/draft', { revision: rev, content: draft }, 'PATCH')).status,
          400,
        );
        draft.rollOnlyConsent = true;
        const saved = await auth('website/draft', { revision: rev, content: draft }, 'PATCH');
        rev = saved.data.revision;
        await auth('website/publish', { revision: rev });
        assert.equal(
          (await request('public-websites/' + a.slug + '/results', { ...input, dob: undefined }))
            .status,
          201,
        );
        const duplicate = await db.student.create({
          data: { campusId: a.campus.id, studentCode: 'CMS-002', fullName: 'Duplicate Roll' },
        });
        const dupe = await db.enrollment.create({
          data: {
            studentId: duplicate.id,
            sectionId: section.id,
            sessionId: a.session.id,
            rollNumber: '17',
          },
        });
        assert.equal((await request('public-websites/' + a.slug + '/results', input)).status, 404);
        await db.enrollment.delete({ where: { id: dupe.id } });
        await db.student.delete({ where: { id: duplicate.id } });
      },
    );
    await t.test(
      'unverified domains never route; verified domains disconnect immediately',
      async () => {
        const host = 'www.cms-' + randomUUID().slice(0, 8) + '.example';
        const domain = await auth('website/domains', { hostname: host });
        assert.equal(domain.status, 201);
        assert.equal(
          (
            await request(
              'website/domains/' + domain.data.id + '/verify',
              {},
              b.cookie,
              b.campus.id,
            )
          ).status,
          404,
        );
        assert.equal((await request('public-websites/resolve?host=' + host)).status, 404);
        await db.websiteDomain.update({
          where: { id: domain.data.id },
          data: { status: 'VERIFIED', verifiedAt: new Date() },
        });
        assert.equal(
          (await request('public-websites/resolve?host=' + host)).data.subdomain,
          a.slug,
        );
        assert.equal(
          (await request('public-websites/tls-authorization?domain=' + host)).status,
          200,
        );
        assert.equal(
          (await request('public-websites/resolve?host=' + a.slug + '.localhost')).status,
          200,
        );
        await auth('website/domains/' + domain.data.id, undefined, 'DELETE');
        assert.equal((await request('public-websites/resolve?host=' + host)).status, 404);
      },
    );
    await t.test(
      'enquiries stay private and suspended institutions disappear from public routing',
      async () => {
        const input = {
          name: 'Prospective Parent',
          email: 'parent@example.test',
          message: 'Please send the admissions information.',
        };
        assert.equal(
          (await request('public-websites/' + a.slug + '/inquiries', input)).status,
          201,
        );
        assert.equal(
          (
            await request('public-websites/' + a.slug + '/inquiries', {
              ...input,
              website: 'spam.example',
            })
          ).status,
          201,
        );
        const inbox = await auth('website/inquiries');
        assert.equal(inbox.data.length, 1);
        assert.equal(
          (await request('website/inquiries', undefined, b.cookie, b.campus.id)).data.length,
          0,
        );
        assert.equal(
          (
            await request(
              'website/inquiries/' + inbox.data[0].id,
              { status: 'READ' },
              b.cookie,
              b.campus.id,
              'PATCH',
            )
          ).status,
          404,
        );
        await db.subscription.update({
          where: { organizationId: a.organization.id },
          data: { currentPeriodEnd: new Date(Date.now() - 1000) },
        });
        assert.equal(
          (await auth('website/draft', { revision: rev, content: draft }, 'PATCH')).status,
          402,
        );
        assert.equal((await request('public-websites/' + a.slug)).status, 200);
        await db.organization.update({
          where: { id: a.organization.id },
          data: { status: 'SUSPENDED' },
        });
        assert.equal((await request('public-websites/' + a.slug)).status, 404);
        assert.equal(
          (await request('public-websites/' + a.slug + '/results/report?token=' + resultToken))
            .status,
          404,
        );
      },
    );
  },
);
