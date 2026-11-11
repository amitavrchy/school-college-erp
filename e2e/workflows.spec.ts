import { test, expect } from '@playwright/test';
async function login(page: any, email='admin@campusone.edu.bd') {
  await page.goto('/login'); await page.getByLabel('Email address').fill(email); await page.getByLabel('Password',{exact:true}).fill(process.env.SEED_PASSWORD||'CampusOne!2026'); await page.getByRole('button',{name:'Sign in to Campus One'}).click(); await expect(page).not.toHaveURL(/login/);
}
test('administrator navigates every workspace without a page error',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await login(page);await expect(page.getByRole('heading',{name:'Campus overview'})).toBeVisible();
  for(const [path,heading] of [['students','Students'],['admissions','Admissions'],['attendance','Attendance'],['academics','Academics'],['fees','Fees & payments'],['exams','Exams & results'],['notices','Notice board'],['reports','Reports & insights'],['settings','Settings']] as const){await page.goto(`/${path}`);await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();await expect(page.getByText('Something needs attention')).toHaveCount(0);}
  expect(errors).toEqual([]);
});
test('student search, class attendance and invoice payment persist',async({page})=>{
  await login(page);await page.goto('/students');await page.getByRole('textbox',{name:'Search by name or student ID…'}).fill('Arham');await expect(page.locator('tbody tr').first()).toContainText('Arham');
  await page.goto('/attendance');await expect(page.locator('tbody tr').first()).toBeVisible();await page.getByRole('button',{name:'Mark all present'}).click();await page.getByRole('button',{name:'Save attendance',exact:true}).click();await expect(page.getByRole('status')).toContainText('Attendance saved');
  await page.goto('/fees');await page.getByRole('button',{name:'Collect payment'}).click();await page.getByLabel('Student',{exact:true}).selectOption({index:1});await page.getByLabel('Payment amount (BDT)').fill('1');await page.getByLabel('Payment method').selectOption('MANUAL');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('status')).toContainText('Payment recorded');
});
test('guardian sees linked children, published results and no staff navigation',async({page})=>{
  await login(page,'guardian@campusone.edu.bd');await expect(page).toHaveURL(/guardian/);await expect(page.getByRole('heading',{name:'Hello, Ayesha.'})).toBeVisible();await expect(page.getByRole('link',{name:'Admissions',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Exams & results',exact:true}).click();await expect(page.getByRole('heading',{name:'Mid-year Examination'})).toBeVisible();await expect(page.getByText('Annual Examination',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Create exam term'})).toHaveCount(0);
});
test('mobile navigation and minimum font size remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page);await expect(page.getByRole('heading',{name:'Campus overview'})).toBeVisible();await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('link',{name:'Students',exact:true}).click();await expect(page.getByRole('heading',{name:'Students',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const small=await page.locator('body *').evaluateAll(nodes=>nodes.filter(n=>n instanceof HTMLElement&&n.getClientRects().length&&n.textContent?.trim()&&parseFloat(getComputedStyle(n).fontSize)<14).map(n=>`${n.tagName}:${getComputedStyle(n).fontSize}`));expect(small).toEqual([]);
});
