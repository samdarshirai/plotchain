import { expect, test, Page } from '@playwright/test';
import { audit } from './table-audit';

// Associates see income for CLOSED cycles only; the admin ledger register includes the live
// (open, "Ongoing") cycle. The backend does the filtering, so the API is mocked here the way the
// server now answers each role. Only the frontend dev server is needed.

const closed1 = { id: 'c1', periodStart: '2026-09-01', periodEnd: '2026-09-15', status: 'CLOSED' };
const closed2 = { id: 'c2', periodStart: '2026-09-16', periodEnd: '2026-09-30', status: 'CLOSED' };
const open = { id: 'c3', periodStart: '2026-10-01', periodEnd: null, status: 'OPEN' };

const summaryRow = (c: typeof closed1) => ({
  associateUserId: null, associateName: null, cycleId: c.id, cyclePeriodStart: c.periodStart, cyclePeriodEnd: c.periodEnd,
  gross: { DIRECT: 50000, MATCHING: 20000 }, totalGross: 70000, tds: 3500, adminCharges: 2800, totalNet: 63700,
  entryCount: 2, paidCount: 0, paidAt: null
});

const profile = { name: 'E2E Associate', userId: 'VP00009', designation: null, joinedAt: '2026-01-01T00:00:00Z' };

const jwt = () => 'e30.' + btoa(JSON.stringify({ exp: 4102444800 })) + '.x'; // fake JWT, exp year 2100

async function openAssociate(page: Page, path: string, seen: string[]) {
  await page.addInitScript(token => {
    localStorage.setItem('plotchain.auth.token', token);
    localStorage.setItem('plotchain.auth.mustChangePassword', 'false');
    localStorage.setItem('plotchain.auth.role', 'ASSOCIATE');
  }, jwt());
  await page.route('**/api/**', r => r.fulfill({ json: {} }));
  await page.route('**/api/company/setup-state', r => r.fulfill({ json: { launchedAt: '2026-01-01T00:00:00Z' } }));
  await page.route('**/api/associates/me/profile', r => r.fulfill({ json: profile }));
  // The server hides the OPEN cycle (c3): only closed cycles come back.
  await page.route(/\/api\/associates\/me\/income-summary/, r => { seen.push(r.request().url()); return r.fulfill({ json: [summaryRow(closed2), summaryRow(closed1)] }); });
  await page.route(/\/api\/associates\/me\/ledger/, r => r.fulfill({ json: { entries: [], page: 0, size: 20, totalElements: 0, totalGrossAmount: 0 } }));
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

for (const width of [390, 800, 1280]) {
  test.describe(`associate income statement at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('All tab lists closed cycles only, never an ongoing one', async ({ page }) => {
      const seen: string[] = [];
      await openAssociate(page, '/income-statement', seen);
      const select = page.locator('.income-statement__filters select').first();
      await expect(select.locator('option')).toHaveCount(3); // "All cycles" + 2 closed
      await expect(select).not.toContainText(/ongoing/i);
      await expect(page.locator('.income-statement__table')).toBeVisible();
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every(u => u.includes('/api/associates/me/'))).toBe(true); // self-scoped, never an admin route
    });

    test('table and page do not scroll sideways', async ({ page }) => {
      await openAssociate(page, '/income-statement', []);
      expect(await page.evaluate(audit)).toEqual([]);
    });
  });
}

test.describe('associate dashboard', () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test('renders a zero open-cycle total without sideways scroll', async ({ page }) => {
    await page.addInitScript(token => {
      localStorage.setItem('plotchain.auth.token', token);
      localStorage.setItem('plotchain.auth.mustChangePassword', 'false');
      localStorage.setItem('plotchain.auth.role', 'ASSOCIATE');
    }, jwt());
    let dashboardCalls = 0;
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/company/setup-state', r => r.fulfill({ json: { launchedAt: '2026-01-01T00:00:00Z' } }));
    await page.route('**/api/associates/me/profile', r => r.fulfill({ json: profile }));
    await page.route('**/api/associates/me/dashboard', r => {
      dashboardCalls++;
      return r.fulfill({ json: { cycleIncome: {
        cycleId: open.id, directIncome: 0, matchingIncome: 0, sponsorMatchingIncome: 0, royaltyBonus: 0, royaltyBonusPct: 0,
        totalIncome: 0, previousCycleTotalIncome: 63700, incomeTrend: [63700], matchingIncomeLifetime: 20000, sponsorMatchingIncomeLifetime: 0
      } } });
    });
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    expect(dashboardCalls).toBeGreaterThan(0);
    const d = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(d.sw).toBeLessThanOrEqual(d.cw);
  });
});

test.describe('admin ledger register keeps the live cycle', () => {
  for (const width of [390, 800, 1280]) {
    test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height: 900 } });

      test('offers the ongoing cycle and shows its rows, without sideways scroll', async ({ page }) => {
        await page.addInitScript(token => {
          localStorage.setItem('plotchain.auth.admin.token', token);
          localStorage.setItem('plotchain.auth.admin.mustChange', 'false');
          localStorage.setItem('plotchain.auth.admin.role', 'ADMIN');
        }, jwt());
        await page.route('**/api/**', r => r.fulfill({ json: { name: 'Admin' } }));
        await page.route('**/api/company/setup-state', r => r.fulfill({ json: { launchedAt: '2026-01-01T00:00:00Z' } }));
        await page.route('**/api/admin/cycles?*', r => r.fulfill({ json: { cycles: [open, closed2, closed1], page: 0, size: 100, totalElements: 3 } }));
        await page.route('**/api/admin/ledger?*', r => r.fulfill({ json: { entries: [{
          id: 'l1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Live Earner', incomeType: 'MATCHING',
          cycleId: open.id, cyclePeriodStart: open.periodStart, cyclePeriodEnd: null, grossAmount: 20000, tdsDeduction: 1000,
          adminDeduction: 800, netAmount: 18200, status: 'PENDING', sourceRef: 'x', createdAt: '2026-10-05T10:00:00Z',
          fulfilledAt: null, fulfilmentRemark: null
        }], page: 0, size: 20, totalElements: 1 } }));
        await page.goto('/admin/settings/ledger-register', { waitUntil: 'networkidle' });
        await expect(page.locator('.ledger-register__filters select').first()).toBeVisible();
        await expect(page.locator('.ledger-register__filters option', { hasText: /ongoing/i }).first()).toBeAttached();
        await expect(page.locator('.ledger-register .editable-table')).toContainText('Live Earner');
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        expect(await page.evaluate(audit)).toEqual([]);
      });
    });
  }
});
