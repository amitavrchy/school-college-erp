import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { removeTestTenant } from '../../backend/test/tenant-cleanup';

test('school CMS publishes a branded website, serves subdomains and exposes only matching results', async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  const env = readFileSync(resolve(__dirname, '../../backend/.env'), 'utf8');
  const url =
    process.env.DATABASE_URL ||
    env
      .match(/^DATABASE_URL=(.*)$/m)?.[1]
      .trim()
      .replace(/^["']|["']$/g, '');
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw Error('Website browser fixtures require the local test database');
  const { PrismaClient } = require('../../backend/node_modules/@prisma/client');
  const db = new PrismaClient({ datasourceUrl: url }),
    slug = 'test-web-' + randomUUID().slice(0, 8);
  try {
    const registered = await page.request.post('/api/saas/register', {
      data: {
        organizationName: 'Website Browser Academy',
        slug,
        campusName: 'Main campus',
        planCode: 'STARTER',
        fullName: 'Website Test Owner',
        email: slug + '@example.test',
        password: 'WebsiteFixture!2026Strong',
      },
    });
    expect(registered.status()).toBe(201);
    const account = await registered.json();
    const transport = await page.request.get('/api/socket.io/?EIO=4&transport=polling');
    expect(transport.status()).toBe(200);
    expect(await transport.text()).toMatch(/^0\{/);
    await page.goto('/website');
    await page.getByLabel('School subdomain', { exact: true }).fill(slug);
    await page.getByRole('button', { name: 'Create school website', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Make it your school’s website.' }),
    ).toBeVisible();
    const editorAudit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(editorAudit.violations).toEqual([]);
    await page
      .getByLabel('School display name', { exact: true })
      .fill('Cedar International Academy');
    await page.getByLabel('School tagline', { exact: true }).fill('A school for curious minds.');
    const section = (name: string) =>
      page
        .getByRole('navigation', { name: 'Website editor sections' })
        .getByRole('button', { name, exact: true });
    await section('Pages').click();
    await page.getByLabel('Block heading', { exact: true }).fill('A place to learn and belong.');
    await page
      .getByLabel('Block text', { exact: true })
      .fill(
        'Welcome to our school community. Explore our academic programme and meet the school office.',
      );
    await section('Admissions & results').click();
    await page.getByLabel('Enable public examination result lookup').check();
    await page.getByLabel('Show online admission application link').check();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Draft saved');
    await page.getByRole('button', { name: 'Preview saved draft', exact: true }).click();
    const preview = page.getByRole('link', { name: 'Open draft preview' });
    await expect(preview).toBeVisible();
    const publicPage = await context.newPage();
    await publicPage.goto((await preview.getAttribute('href'))!);
    await expect(publicPage.getByText(/Private draft preview/)).toBeVisible();
    await expect(
      publicPage.getByRole('heading', { name: 'A place to learn and belong.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Publish saved draft', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Website published');
    await publicPage.goto('/school/' + slug);
    await expect(
      publicPage.getByRole('heading', { name: 'A place to learn and belong.' }),
    ).toBeVisible();
    await expect(publicPage.getByText(/Private draft preview/)).toHaveCount(0);
    const audit = await new AxeBuilder({ page: publicPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    const cls = await db.schoolClass.create({
      data: { campusId: account.campus.id, name: 'Class 7', numericLevel: 7 },
    });
    const sectionData = await db.section.create({
      data: { classId: cls.id, sessionId: account.session.id, name: 'A' },
    });
    const student = await db.student.create({
      data: {
        campusId: account.campus.id,
        studentCode: 'WEBSITE-001',
        fullName: 'Rayan Rahman',
        dob: new Date('2012-05-10'),
      },
    });
    const enrollment = await db.enrollment.create({
      data: {
        studentId: student.id,
        sessionId: account.session.id,
        sectionId: sectionData.id,
        rollNumber: '17',
      },
    });
    const subject = await db.subject.create({
      data: { campusId: account.campus.id, name: 'Mathematics', code: 'MATH' },
    });
    const term = await db.examTerm.create({
      data: { sessionId: account.session.id, name: 'Annual Assessment', status: 'PUBLISHED' },
    });
    await db.examMark.create({
      data: {
        termId: term.id,
        enrollmentId: enrollment.id,
        subjectId: subject.id,
        marksObtained: 88,
        maxMarks: 100,
      },
    });
    await publicPage
      .getByRole('navigation', { name: 'School website navigation' })
      .getByRole('link', { name: 'Results', exact: true })
      .click();
    await publicPage.getByLabel('Examination', { exact: true }).selectOption(term.id);
    await publicPage.getByLabel('Class and section', { exact: true }).selectOption(sectionData.id);
    await publicPage.getByLabel('Roll number', { exact: true }).fill('17');
    await publicPage.getByLabel('Date of birth', { exact: true }).fill('2012-05-10');
    await publicPage.getByRole('button', { name: 'View published result', exact: true }).click();
    await expect(
      publicPage.getByRole('heading', { name: 'Rayan Rahman', exact: true }),
    ).toBeVisible();
    await expect(publicPage.getByText('GPA 5.00', { exact: true })).toBeVisible();
    const download = publicPage.waitForEvent('download');
    await publicPage.getByRole('link', { name: 'Download result PDF' }).click();
    expect((await download).suggestedFilename()).toBe('school-exam-result.pdf');
    const resultsAudit = await new AxeBuilder({ page: publicPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(resultsAudit.violations).toEqual([]);
    await publicPage
      .getByRole('navigation', { name: 'School website navigation' })
      .getByRole('link', { name: 'Contact', exact: true })
      .click();
    await publicPage.getByLabel('Your name', { exact: true }).fill('A Prospective Parent');
    await publicPage.getByLabel('Email address', { exact: true }).fill('parent@example.test');
    await publicPage
      .getByLabel('Your enquiry', { exact: true })
      .fill('Please share admission requirements and arrange a school visit.');
    await publicPage.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(publicPage.getByRole('status')).toContainText('sent to the school office');
    await section('Enquiries').click();
    await expect(page.getByRole('heading', { name: 'A Prospective Parent' })).toBeVisible();
    await page.getByRole('button', { name: 'Mark resolved', exact: true }).click();
    await expect(page.locator('.cms-inquiry .badge')).toHaveText('RESOLVED');
    // Browsers resolve *.localhost; this exercises actual Host routing without external DNS.
    const address = new URL(page.url());
    await publicPage.goto(
      address.protocol + '//' + slug + '.localhost:' + address.port + '/results',
    );
    await expect(
      publicPage.getByRole('heading', { name: 'Find your result', exact: true }),
    ).toBeVisible();
    expect(await publicPage.evaluate(async () => (await fetch('/api/auth/me')).status)).toBe(404);
    await publicPage.setViewportSize({ width: 390, height: 844 });
    expect(
      await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await publicPage.getByRole('button', { name: 'Open school menu' }).click();
    await expect(publicPage.getByRole('link', { name: 'Results', exact: true })).toBeVisible();
    const sitemap = await page.request.get('/school/' + slug + '/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('<urlset');
    const feed = await page.request.get('/school/' + slug + '/feed.xml');
    expect(feed.status()).toBe(200);
    await section('Domains').click();
    await page.getByLabel('Custom domain hostname').fill('www.' + slug + '.example');
    await page.getByRole('button', { name: 'Connect domain', exact: true }).click();
    await expect(page.locator('.cms-domain .badge')).toHaveText('PENDING');
    await expect(page.locator('.cms-dns-table')).toContainText('campusone-verification=');
  } finally {
    const org = await db.organization.findUnique({ where: { slug } });
    if (org) await removeTestTenant(db, org.id);
    await db.$disconnect();
  }
});
