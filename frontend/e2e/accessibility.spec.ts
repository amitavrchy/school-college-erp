import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public pages and advanced workspaces pass automated accessibility checks', async ({
  page,
}) => {
  test.setTimeout(180_000);
  async function audit(path: string) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    // Wait for API-backed content before scanning rather than auditing skeletons.
    await expect(page.getByText('Loading your workspace…', { exact: true })).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  }
  await audit('/');
  await audit('/login');
  await page.getByLabel('Email address').fill('admin@campusone.edu.bd');
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.SEED_PASSWORD || 'CampusOne!2026');
  await page.getByRole('button', { name: 'Sign in to Campus One' }).click();
  await expect(page).toHaveURL(/overview/);
  for (const path of [
    '/overview',
    '/library',
    '/transport',
    '/homework',
    '/support',
    '/subscription',
  ]) {
    await audit(path);
  }
});
