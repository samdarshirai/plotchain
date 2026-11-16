import { expect, test, Page } from '@playwright/test';
import { audit } from './table-audit';

// Plot Transfer, Plot Cancel and View Cancelled Plots with one realistic, fully populated row.
// Rule (CLAUDE.md): no table scrolls sideways at 390 / 800 / 1280px, stacked cells keep their labels.
// The API is mocked and the session is a fake admin JWT, so only the frontend dev server is needed
// (set ASSOCIATE_USER/ASSOCIATE_PASSWORD to skip the backend-backed global setup).

const booking = {
  id: 'b1', plotId: 'pl1', associateId: 'a1', status: 'ACTIVE', buyerName: 'Buyer With A Longer Display Name', buyerPhone: '9876543210',
  totalAmount: 600000, installmentCount: 4, bookedAt: '2026-10-01T12:00:00Z', paidAmount: 150000, dueAmount: 450000, installments: [],
  plotNo: 'A-101 New1', projectName: 'A Residential Project With A Rather Long Name', associateName: 'Sponsor With A Longer Display Name',
  associateCode: 'VP00001', associatePhone: '9876543210', plotType: 'NORMAL', areaSqft: 1200, rate: 500, extraPrice: 0, discount: 0
};
const cancelled = {
  ...booking, status: 'CANCELLED', cancelledAt: '2026-10-05T12:00:00Z', cancelReason: 'Buyer changed their mind about the purchase',
  cancellationChargePct: 35, cancellationCharge: 52500, refundAmount: 97500
};

async function setup(page: Page, bookings: unknown[]) {
  await page.addInitScript(() => {
    localStorage.setItem('plotchain.auth.admin.token', 'e30.' + btoa(JSON.stringify({ exp: 4102444800 })) + '.x'); // fake JWT, exp year 2100
    localStorage.setItem('plotchain.auth.admin.mustChange', 'false');
    localStorage.setItem('plotchain.auth.admin.role', 'ADMIN');
  });
  // Playwright tries the last-registered route first: catch-all first, specifics after.
  await page.route('**/api/**', r => r.fulfill({ json: { name: 'Admin' } }));
  await page.route('**/api/company/setup-state', r => r.fulfill({ json: { launchedAt: '2026-01-01T00:00:00Z' } }));
  await page.route('**/api/company/projects', r => r.fulfill({ json: [{ id: 'p1', name: 'A Residential Project With A Rather Long Name' }] }));
  await page.route('**/api/associates', r => r.fulfill({ json: [] }));
  await page.route('**/api/admin/cycles', r => r.fulfill({ json: [] }));
  await page.route('**/api/admin/bookings?*', r => r.fulfill({ json: { bookings, page: 0, size: 100, totalElements: bookings.length } }));
}

async function open(page: Page, screen: string) {
  await page.goto(`/admin/settings/${screen}`, { waitUntil: 'networkidle' });
  await expect(page.locator('.add-plot-emi__table tbody tr')).toHaveCount(1);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // let table-fit settle
}

for (const width of [390, 800, 1280]) {
  test.describe(`plot transfer / cancel tables at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const [screen, rows] of [['plot-transfer', [booking]], ['plot-cancel', [booking]], ['view-cancelled-plot', [cancelled]]] as const) {
      test(`${screen} table fits and keeps its labels`, async ({ page }) => {
        await setup(page, [...rows]);
        await open(page, screen);
        expect(await page.evaluate(audit)).toEqual([]);
      });
    }

    for (const screen of ['plot-transfer', 'plot-cancel']) {
      test(`${screen} Plot No filter reloads the list with the typed plot name`, async ({ page }) => {
        await setup(page, [booking]);
        await open(page, screen);
        const input = page.locator('input[name=plotNo]');
        await expect(input).toBeVisible();
        const reload = page.waitForRequest(r => r.url().includes('/api/admin/bookings?') && new URL(r.url()).searchParams.get('plotNo') === 'A-101 New1');
        await input.fill('A-101 New1');
        await input.press('Tab'); // the filter applies on change
        const req = await reload;
        expect(new URL(req.url()).searchParams.get('status')).toBe('ACTIVE');
        await expect(page.locator('.add-plot-emi__table tbody tr')).toHaveCount(1);
        expect(await page.evaluate(audit)).toEqual([]);
      });
    }

    test('plot-transfer row offers Transfer, not Cancel', async ({ page }) => {
      await setup(page, [booking]);
      await open(page, 'plot-transfer');
      await expect(page.getByRole('button', { name: 'Transfer', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
    });

    test('view-cancelled-plot shows charge %, charge and refund', async ({ page }) => {
      await setup(page, [cancelled]);
      await open(page, 'view-cancelled-plot');
      const row = page.locator('.add-plot-emi__table tbody tr').first();
      await expect(row).toContainText('35%');
      await expect(row).toContainText('52,500');
      await expect(row).toContainText('97,500');
    });

    test('plot-cancel popup fits, computes the charge and enforces the rules', async ({ page }) => {
      await setup(page, [booking]);
      let posted: unknown = null;
      await page.route('**/api/admin/bookings/b1/cancel', r => { posted = r.request().postDataJSON(); return r.fulfill({ json: {} }); });
      await open(page, 'plot-cancel');
      await expect(page.getByRole('button', { name: 'Transfer', exact: true })).toHaveCount(0);

      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      const modal = page.locator('.add-plot-emi__modal');
      await expect(modal).toBeVisible();
      const charge = modal.locator('input[name=charge]');
      const refund = modal.locator('input[name=refund]');
      await expect(charge).toHaveJSProperty('readOnly', true);
      await expect(modal.locator('input[name=chargePct]')).toHaveValue('35');
      await expect(charge).toHaveValue(/52,500/);
      await expect(refund).toHaveValue(/97,500/);

      // The popup never needs a sideways scrollbar, on the page or inside itself.
      expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      await modal.locator('input[name=chargePct]').fill('20');
      await expect(modal).toContainText('35 to 100');
      await modal.locator('input[name=chargePct]').fill('50');
      await expect(charge).toHaveValue(/75,000/);
      await expect(refund).toHaveValue(/75,000/);

      // Reason and pay mode are mandatory: nothing is sent until both are given.
      await modal.getByRole('button', { name: 'Yes, cancel booking' }).click();
      expect(posted).toBeNull();
      await modal.locator('textarea[name=cancelReason]').fill('Buyer withdrew');
      await modal.locator('select[name=payMode]').selectOption('UPI');
      await modal.getByRole('button', { name: 'Yes, cancel booking' }).click();
      await expect.poll(() => posted).toEqual({ reason: 'Buyer withdrew', chargePct: 50, payMode: 'UPI' });
      await expect(modal).toBeHidden();
    });
  });
}
