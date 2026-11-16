import { expect, test } from '@playwright/test';

test('language selection persists across sign-in, admission and guardian pages', async ({
  page,
}) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      '/api/admissions/options': [
        {
          id: 'c1',
          name: 'Main',
          sessions: [{ id: 's1', name: '2026' }],
          classes: [{ id: 'cl1', name: 'Class 1' }],
        },
      ],
      '/api/auth/me': {
        fullName: 'A Guardian',
        roles: [{ role: 'GUARDIAN', campusId: 'c1', campus: { orgId: 'o1' } }],
      },
      '/api/campuses': [
        { id: 'c1', name: 'Main', sessions: [{ id: 's1', name: '2026', status: 'ACTIVE' }] },
      ],
      '/api/guardians/me/dashboard': {
        students: [
          {
            id: 'student1',
            fullName: 'Student',
            studentCode: '1',
            enrollments: [
              {
                status: 'ACTIVE',
                sectionId: 'sec1',
                section: { name: 'A', schoolClass: { name: 'Class 1' } },
                rollNumber: 1,
                attendance: [{ id: 'a1', date: '2026-01-01', status: 'PRESENT' }],
              },
            ],
            invoices: [],
          },
        ],
      },
      '/api/notices': [],
      '/api/leaves': [],
      '/api/exams/results/student1': [],
      '/api/timetable': [],
    };
    await route.fulfill({ json: data[path] ?? [] });
  });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByLabel('Language / ভাষা').selectOption('bn');
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.getByRole('heading', { name: 'আবার আপনাকে দেখে ভালো লাগছে।' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.getByLabel('ইমেইল ঠিকানা')).toBeVisible();
  await page.goto('/apply');
  await expect(page.getByLabel('শিক্ষার্থীর পূর্ণ নাম')).toBeVisible();
  await page.goto('/guardian');
  await expect(page.getByText('সাম্প্রতিক উপস্থিতি').first()).toBeVisible();
  await expect(page.getByText('100%')).toBeVisible();
  await page.getByLabel('Language / ভাষা').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Recent attendance').first()).toBeVisible();
});
