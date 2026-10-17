import { expect, Locator, Page, test } from '@playwright/test';

// Layout fixtures avoid a backend dependency and never modify real records.
test.describe.configure({ mode: 'parallel' });
test.use({ hasTouch: true });

const longText = 'A long display name for checking responsive layouts';
const master = { id: 'p1', name: longText, type: 'PLOT', city: longText, state: 'Maharashtra', businessPercentage: 10,
  ratePerSqft: 3750, status: 'ACTIVE', hasLocationMap: true, hasProjectMap: true };
const plot = { id: 'plot1', plotId: 'plot1', plotNo: 'A-101', plotType: 'NORMAL', type: 'NORMAL', area: 1200,
  areaSqft: 1200, rate: 3750, price: 4500000, extraPrice: 10000, roadSizeFt: 30, status: 'AVAILABLE' };

async function mockSession(page: Page, role = 'ADMIN') {
  await page.addInitScript(role => {
    localStorage.setItem('plotchain.auth.token', `test.${btoa(JSON.stringify({ exp: 4102444800 }))}.test`);
    localStorage.setItem('plotchain.auth.role', role);
    localStorage.setItem('plotchain.auth.mustChangePassword', 'false');
  }, role);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path.endsWith('/setup-state')) json = { launchedAt: '2026-01-01', steps: [], canGoLive: true };
    else if (path === '/api/admin/users') json = [{ id: 'u1', userId: 'ADMIN001', name: longText,
      phone: '9876543210', email: 'averylongemailaddressfortesting@example.com', status: 'ACTIVE', lastLoginAt: '2026-10-01T12:00:00Z' }];
    else if (path === '/api/admin/kyc') json = { entries: [{ id: 'k1', userId: 'VP00001', name: longText, kycStatus: 'PENDING', joinedAt: '2026-10-01' }], totalElements: 1, page: 0, size: 20 };
    else if (path === '/api/admin/kyc/counts') json = { pending: 1, verified: 0, rejected: 0 };
    else if (path.endsWith('/me/photo')) return route.fulfill({ status: 404 });
    else if (path.endsWith('/me/kyc')) json = { kycStatus: 'VERIFIED' };
    else if (path === '/api/associates/me/profile') json = { id: 'a1', userId: 'VP00001', name: longText, phone: '9876543210', joinedAt: '2026-10-01' };
    else if (path.endsWith('/rank-progress')) json = { currentRank: 'Associate', nextRank: 'Silver', progressPercent: 20, cumulativeMatchedVolume: 100000, volumeToNextRank: 400000, rewardTiers: [] };
    else if (path === '/api/admin/master-projects') json = [master];
    else if (path === '/api/admin/news') json = [{ id: 'n1', newsDate: '2026-10-01', title: longText, body: 'LongAnnouncementWithoutSpaces'.repeat(12) }];
    else if (path === '/api/admin/expense-types') json = [{ id: 'e1', name: longText, status: 'ACTIVE' }];
    else if (path === '/api/company/projects') json = [{ ...master, masterProjectId: 'p1', location: longText, hasThumbnail: false, totalPlots: 1, availablePlots: 1, soldPlots: 0 }];
    else if (path.endsWith('/plots/grid')) json = [plot];
    else if (path.endsWith('/plots/plot1')) json = plot;
    else if (path.endsWith('/plots')) json = { plots: [plot], totalElements: 1 };
    else if (path === '/api/associates') json = [];
    else if (path.endsWith('/booking-emi')) json = { emiEnabled: true, defaultInstallmentCount: 4 };
    else if (path.endsWith('/epins/unlock')) json = { token: 'layout-unlock', expiresAt: '2100-01-01T00:00:00Z' };
    else if (path.endsWith('/epins/unused') || path.endsWith('/epins/used')) json = { rows: [{ id: 'pin-123456789', code: 'PIN-123456789', pinValue: 1500,
      transferBy: 'VP00001', transferDate: '2026-10-01', usedDate: '2026-10-02', usedByUserId: 'VP00002', usedByName: longText }], totalElements: 50 };
    return route.fulfill({ json });
  });
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
async function fitsInside(locator: Locator) {
  expect(await locator.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test.describe(`changed screens at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: width < 768 });
    test.beforeEach(async ({ page }) => mockSession(page));
    for (const screen of ['admin-users', 'master-projects', 'news', 'expense-types']) {
      test(`${screen}: populated list and scrollable form`, async ({ page }, testInfo) => {
        await page.goto(`/settings/${screen}`, { waitUntil: 'networkidle' });
        await expect(page.locator(`.${screen} .editable-table tbody tr`)).toHaveCount(1);
        await noPageOverflow(page);
        if (width < 1024) await fitsInside(page.locator(`.${screen} .editable-table`));
        await page.screenshot({ path: testInfo.outputPath('list.png'), fullPage: true });
        await page.locator(`.${screen}__add`).click();
        const modal = page.locator(`.${screen}__modal`);
        await expect(modal).toBeVisible();
        await fitsInside(modal);
        const bounds = (await modal.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        const input = modal.locator('input:not([type=file])').first();
        if (width < 768) expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
        await page.setViewportSize({ width, height: 400 });
        await modal.locator(`.${screen}__modal-cancel`).click();
        await expect(modal).toBeHidden();
        await noPageOverflow(page);
      });
    }
    test('KYC: populated review table scrolls within its panel', async ({ page }) => {
      await page.goto('/settings/kyc-queue', { waitUntil: 'networkidle' });
      await expect(page.locator('.kyc-queue .editable-table tbody tr')).toHaveCount(1);
      await noPageOverflow(page);
      await expect(page.locator('.kyc-queue__table-scroll')).toHaveCSS('overflow-x', 'auto');
    });

    test('plots: populated table and edit dialog', async ({ page }, testInfo) => {
      await page.goto('/settings/plots', { waitUntil: 'networkidle' });
      await expect(page.locator('.projects-plots__table tbody tr')).toHaveCount(1);
      await noPageOverflow(page);
      for (const cell of await page.locator('.projects-plots__table th, .projects-plots__table td').all()) await fitsInside(cell);
      await page.screenshot({ path: testInfo.outputPath('plots.png'), fullPage: true });
      await page.locator('.projects-plots__row-edit').click();
      const modal = page.locator('.projects-plots__modal');
      await expect(modal.locator('input[name=plotNo]')).toHaveValue('A-101');
      await fitsInside(modal);
      if (width < 768) expect(await modal.locator('input[name=plotNo]').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      await page.setViewportSize({ width, height: 400 });
      await modal.locator('button[type=button]').last().click();
      await expect(modal).toBeHidden();
      await page.locator('.projects-plots__project-actions button').last().click();
      await expect(modal.locator('input[name=plotNo]')).toHaveValue('');
      await fitsInside(modal);
      await modal.locator('button[type=button]').last().click();
    });

    test('admin user password reset fits on short screens', async ({ page }) => {
      await page.goto('/settings/admin-users', { waitUntil: 'networkidle' });
      await page.locator('.admin-users__reset').click();
      const modal = page.locator('.admin-users__reset-modal .admin-users__modal');
      await fitsInside(modal);
      await page.setViewportSize({ width, height: 400 });
      await modal.locator('.admin-users__modal-cancel').click();
      await expect(modal).toBeHidden();
    });

    test('book plot table and booking popup fit the viewport', async ({ page }) => {
      await page.goto('/settings/book-plot', { waitUntil: 'networkidle' });
      await expect(page.locator('.projects-plots__table tbody tr')).toHaveCount(1);
      await noPageOverflow(page);
      for (const cell of await page.locator('.projects-plots__table th, .projects-plots__table td').all()) await fitsInside(cell);
      await page.locator('.projects-plots__row-book').click();
      await expect(page.locator('.book-form')).toBeVisible();
      await fitsInside(page.locator('.projects-plots__modal'));
      await noPageOverflow(page);
    });
  });

  test(`associate plot table at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockSession(page, 'ASSOCIATE');
    await page.goto('/plot-bookings', { waitUntil: 'networkidle' });
    await expect(page.locator('.projects-plots__table tbody tr')).toHaveCount(1);
    await noPageOverflow(page);
    for (const cell of await page.locator('.projects-plots__table th, .projects-plots__table td').all()) await fitsInside(cell);
  });
  test(`profile form at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await mockSession(page, 'ASSOCIATE');
    await page.goto('/profile', { waitUntil: 'networkidle' });
    await expect(page.locator('.my-account--profile .detail-card__fields').first()).toBeVisible();
    await noPageOverflow(page);
    await fitsInside(page.locator('.profile-hero'));
    for (const input of await page.locator('.detail-card input:visible').all()) {
      expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(width < 600 ? 180 : 100);
    }
    await page.screenshot({ path: testInfo.outputPath('profile.png'), fullPage: true });
  });

  for (const mode of ['view-new', 'transfer', 'view-used']) {
    test(`e-pins ${mode} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await mockSession(page, 'ASSOCIATE');
      await page.goto(`/e-pins/unlock?returnUrl=/e-pins/${mode}`, { waitUntil: 'networkidle' });
      await page.locator('input[type=password]').fill('layout-password');
      await page.locator('button[type=submit]').click();
      await expect(page.locator('.epin-reg__table tbody tr')).toHaveCount(1);
      await noPageOverflow(page);
      await page.locator('.epin-reg__cols summary').click();
      const bounds = (await page.locator('.epin-reg__column-menu').boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath('epins.png'), fullPage: true });
    });
  }
}
