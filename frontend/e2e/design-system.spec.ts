import { expect, test, Page } from '@playwright/test';
import { ROLES } from './routes';

async function checkScreen(page: Page, route: string, screenshotPath: string, navigate = true): Promise<void> {
  if (navigate) { await page.goto(route, { waitUntil: 'networkidle' }); }
  expect(new URL(page.url()).pathname).toBe(route.split('?')[0]);
  const project = page.locator('.projects-plots__project-select select');
  if (await project.count()) {
    // Default projects can be empty. Exercise the actual plot table when data exists.
    const values = await project.locator('option').evaluateAll(options => options.map(option => option.getAttribute('value') ?? '').filter(Boolean));
    for (const value of values) {
      await project.selectOption(value);
      await page.waitForLoadState('networkidle');
      const views = page.locator('.projects-plots__views button');
      if (await views.count()) { await views.nth(2).click(); }
      if (await page.locator('.projects-plots__table').count()) { break; }
    }
  }
  const violations = await page.evaluate(() => {
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) { problems.push(`page overflows by ${root.scrollWidth - root.clientWidth}px`); }
    for (const th of document.querySelectorAll('thead th, .income-statement__reward-row--head')) {
      if (!th.getBoundingClientRect().height) { continue; }
      const style = getComputedStyle(th);
      if (style.backgroundColor === 'rgb(12, 10, 11)') { problems.push(`Ink table header: ${th.textContent}`); }
    }
    for (const button of document.querySelectorAll('.brand-button:not(.brand-button--secondary):not(.brand-button--ghost):not(.brand-button--danger)')) {
      if (!button.getBoundingClientRect().height) { continue; }
      if (getComputedStyle(button).backgroundColor !== 'rgb(92, 26, 42)') { problems.push(`incorrect primary CTA: ${button.textContent}`); }
    }
    return problems;
  });
  expect.soft(violations, route).toEqual([]);
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
}

for (const role of ROLES) for (const width of [360, 390, 768, 1440]) {
  test(`${role.name} design coverage at ${width}px`, async ({ page, request }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    const response = await request.post('/api/auth/login', {
      data: { userId: process.env[role.user] ?? role.defaults[0], password: process.env[role.pass] ?? role.defaults[1] }
    });
    expect(response.ok()).toBeTruthy();
    await page.addInitScript(login => {
      localStorage.setItem('plotchain.auth.token', login.token);
      localStorage.setItem('plotchain.auth.mustChangePassword', 'false');
      localStorage.setItem('plotchain.auth.role', login.role);
    }, await response.json());
    const routes = [...role.routes];
    if (role.name === 'admin') {
      for (const tab of ['unconfirmed', 'confirmed', 'overdue', 'cancelled', 'lastEmi', 'transferred']) {
        routes.push(`/settings/bookings-emi?tab=${tab}`);
      }
    }
    for (const route of routes) {
      await test.step(route, async () => {
        await checkScreen(page, route, testInfo.outputPath(`${route.replace(/[^a-z0-9]/gi, '-')}.png`));
      });
    }
  });
}

test('public screens and all setup steps use the design at desktop and mobile sizes', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/login', '/terms', '/privacy']) {
      await checkScreen(page, route, testInfo.outputPath(`public-${width}-${route.slice(1)}.png`));
    }
  }
  const response = await request.post('/api/auth/login', {
    data: { userId: process.env['ADMIN_USER'] ?? 'admin', password: process.env['ADMIN_PASSWORD'] ?? 'ChangeMe123!' }
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(login => {
    localStorage.setItem('plotchain.auth.token', login.token);
    localStorage.setItem('plotchain.auth.mustChangePassword', 'false');
    localStorage.setItem('plotchain.auth.role', login.role);
  }, await response.json());
  // Render setup against an isolated unlaunched state; never alter the running company.
  await page.route('**/api/company/setup-state', async route => {
    const original = await route.fetch();
    await route.fulfill({ json: { ...await original.json(), launchedAt: null } });
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const step of ['company-profile', 'branding', 'compensation', 'projects', 'payments-kyc', 'review-launch']) {
      await checkScreen(page, `/setup/${step}`, testInfo.outputPath(`setup-${width}-${step}.png`));
    }
  }
});

test('gated e-pin screens render with isolated unlock and register fixtures', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const response = await request.post('/api/auth/login', {
    data: { userId: process.env['ASSOCIATE_USER'] ?? 'VP00001', password: process.env['ASSOCIATE_PASSWORD'] ?? 'ChangeMe123!' }
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(login => {
    localStorage.setItem('plotchain.auth.token', login.token);
    localStorage.setItem('plotchain.auth.mustChangePassword', 'false');
    localStorage.setItem('plotchain.auth.role', login.role);
  }, await response.json());
  await page.route('**/api/associates/me/epins/**', async route => {
    if (route.request().url().endsWith('/unlock')) {
      await route.fulfill({ json: { token: 'visual-fixture', expiresAt: new Date(Date.now() + 600_000).toISOString() } });
    } else if (route.request().method() === 'GET') {
      await route.fulfill({ json: { rows: [{ id: 'visual-pin', code: 'VP-VISUAL-0001', pinType: 'REGISTRATION', pinValue: 150000,
        transferDate: '2026-10-01T12:00:00Z', transferBy: 'Fixture Associate', usedDate: null, usedByUserId: null, usedByName: null }],
        page: 0, size: 20, totalElements: 1 } });
    } else { await route.abort(); }
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/e-pins/view-new', '/e-pins/transfer', '/e-pins/view-used', '/e-pins/join/visual-pin']) {
      await page.goto(`/e-pins/unlock?returnUrl=${encodeURIComponent(route)}`, { waitUntil: 'networkidle' });
      await page.locator('input[name="pw"]').fill('visual-fixture');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(`**${route}`);
      await page.waitForLoadState('networkidle');
      await checkScreen(page, route, testInfo.outputPath(`epin-${width}-${route.replace(/[^a-z0-9]/gi, '-')}.png`), false);
    }
  }
});
