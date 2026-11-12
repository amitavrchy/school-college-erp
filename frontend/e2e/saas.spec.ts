import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { removeTestTenant } from '../../backend/test/tenant-cleanup';

async function noSmallText(page: any) {
  const small = await page
    .locator('body *')
    .evaluateAll((nodes: Element[]) =>
      nodes
        .filter(
          (n) =>
            n instanceof HTMLElement &&
            n.getClientRects().length &&
            n.textContent?.trim() &&
            parseFloat(getComputedStyle(n).fontSize) < 14,
        )
        .map((n) => `${n.tagName}.${n.className}: ${getComputedStyle(n).fontSize}`),
    );
  expect(small).toEqual([]);
}
test('landing pricing, role previews and mobile navigation are usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A school day/ })).toBeVisible();
  await expect(page.locator('.lp-price-card')).toHaveCount(3);
  const monthly = await page
    .locator('.lp-price-card')
    .first()
    .locator('.lp-price strong')
    .innerText();
  await page.getByRole('button', { name: 'Yearly', exact: true }).click();
  await expect(page.locator('.lp-price-card').first().locator('.lp-price strong')).not.toHaveText(
    monthly,
  );
  await expect(page.locator('.lp-billed').first()).toContainText('billed yearly');
  await page.getByRole('tab', { name: 'Teachers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'More teaching. Less chasing.' })).toBeVisible();
  await page.getByText('How do bKash and Nagad subscriptions work?', { exact: true }).click();
  await expect(page.getByText(/A reference alone does not activate a plan/)).toBeVisible();
  await noSmallText(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Pricing', exact: true })
    .click();
  await expect(page.locator('.lp-price-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await noSmallText(page);
  expect(errors).toEqual([]);
});

test('institution signup, wallet review and subscription receipt work end to end', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const env = readFileSync(resolve(__dirname, '../../backend/.env'), 'utf8');
  const databaseUrl =
    process.env.DATABASE_URL ||
    env
      .match(/^DATABASE_URL=(.*)$/m)?.[1]
      .trim()
      .replace(/^["']|["']$/g, '');
  if (!databaseUrl || !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname))
    throw new Error('Browser fixtures require the local test database');
  const { PrismaClient } = require('../../backend/node_modules/@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const original = await db.platformSettings.findUniqueOrThrow({ where: { id: 'platform' } });
  const slug = `test-browser-${randomUUID().slice(0, 8)}`;
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  try {
    await admin.goto('/login');
    await admin
      .getByLabel('Email address')
      .fill(process.env.PLATFORM_ADMIN_EMAIL || 'platform@campusone.edu.bd');
    await admin
      .getByLabel('Password', { exact: true })
      .fill(process.env.PLATFORM_SEED_PASSWORD || process.env.SEED_PASSWORD || 'CampusOne!2026');
    await admin.getByRole('button', { name: 'Sign in to Campus One' }).click();
    await expect(admin).toHaveURL(/platform/);
    await admin.getByRole('button', { name: 'Receiving accounts', exact: true }).click();
    await admin.getByRole('button', { name: 'Configure receiving accounts' }).click();
    await admin.getByLabel('bKash receiving number', { exact: true }).fill('01700000001');
    await admin
      .getByLabel('Payment review instructions')
      .fill('Automated local test only. No real money is transferred.');
    await admin.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(admin.getByRole('status')).toContainText('saved');
    await page.goto('/start?plan=STARTER');
    await page.getByLabel('Institution name', { exact: true }).fill('Browser test institution');
    await page.getByLabel('Institution address name').fill(slug);
    await page.getByLabel('Your full name').fill('Browser Test Owner');
    await page.getByLabel('Your email').fill(`${slug}@example.test`);
    await page.getByLabel('Create a password').fill('TenantFixture!2026');
    await page.getByRole('button', { name: 'Create my workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Campus overview' })).toBeVisible();
    await page.goto('/subscription');
    await expect(page.locator('.stat-card').first()).toContainText('Starter');
    await page.getByRole('button', { name: 'Submit transaction', exact: true }).click();
    await page.getByLabel('Plan', { exact: true }).selectOption('plan-growth');
    await page.getByLabel('Billing period').selectOption('MONTHLY');
    await page.getByLabel('Paid using').selectOption('BKASH');
    await page.getByLabel('Sender mobile number').fill('01712345678');
    const reference = `BROWSER${randomUUID().replaceAll('-', '')}`;
    await page.getByLabel('Transaction reference', { exact: true }).fill(reference);
    await page.getByRole('button', { name: 'Send for manual review' }).click();
    await expect(page.getByRole('status')).toContainText('Submitted for review');
    await expect(page.locator('.stat-card').first()).toContainText('Starter');
    await admin.reload();
    await admin.getByRole('button', { name: 'Payment review', exact: true }).click();
    await admin
      .getByRole('row')
      .filter({ hasText: reference })
      .getByRole('button', { name: 'Review payment' })
      .click();
    await admin.getByLabel('Decision', { exact: true }).selectOption('APPROVED');
    const plan = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: 'GROWTH' } });
    await admin.getByLabel(/Amount actually received/).fill(String(plan.monthlyMinor / 100));
    await admin.getByLabel('Review notes').fill('Automated fixture approval; no actual transfer.');
    await admin.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(admin.getByRole('status')).toContainText('saved');
    await page.reload();
    await expect(page.locator('.stat-card').first()).toContainText('Growth');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Receipt', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('subscription-receipt.pdf');
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'A place for every good book.' })).toBeVisible();
    await page.goto('/homework');
    await expect(
      page.getByRole('heading', { name: 'A little learning, carried forward.' }),
    ).toBeVisible();
  } finally {
    await adminContext.close();
    await db.platformSettings.update({
      where: { id: 'platform' },
      data: {
        bkashNumber: original.bkashNumber,
        nagadNumber: original.nagadNumber,
        bankInstructions: original.bankInstructions,
        paymentInstructions: original.paymentInstructions,
        supportEmail: original.supportEmail,
      },
    });
    const org = await db.organization.findUnique({ where: { slug } });
    if (org) await removeTestTenant(db, org.id);
    await db.$disconnect();
  }
});
