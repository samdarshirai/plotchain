import { expect, test, Page } from '@playwright/test';
import { audit } from './table-audit';

// Direct Sponsor Sales (was Sales Register): lives under Plot Booking, has a Plot No column, and cannot void a sale.
// The API is mocked and the session is a fake admin JWT, so only the frontend dev server is needed.

const sale = {
  id: 's1', projectName: 'A Residential Project With A Rather Long Name', associateUserId: 'VP00001', associateName: 'Sponsor With A Longer Display Name',
  plotNo: 'A-101', buyerAssociateUserId: 'VP00002', buyerPlacementUserId: 'VP00003', buyerName: 'Buyer With A Longer Display Name',
  buyerPhone: '9876543210', amount: 1500000, legCredited: 'L', status: 'RECORDED', voidReason: null, recordedAt: '2026-10-01T12:00:00Z'
};
const voided = { ...sale, id: 's2', plotNo: 'A-102', status: 'VOIDED', voidReason: 'Buyer cancelled' };

async function open(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('plotchain.auth.admin.token', 'e30.' + btoa(JSON.stringify({ exp: 4102444800 })) + '.x'); // fake JWT, exp year 2100
    localStorage.setItem('plotchain.auth.admin.mustChange', 'false');
    localStorage.setItem('plotchain.auth.admin.role', 'ADMIN');
  });
  // Playwright tries the last-registered route first: catch-all first, specifics after.
  await page.route('**/api/**', r => r.fulfill({ json: { name: 'Admin' } }));
  await page.route('**/api/company/setup-state', r => r.fulfill({ json: { launchedAt: '2026-01-01T00:00:00Z' } }));
  await page.route('**/api/admin/cycles?*', r => r.fulfill({ json: { cycles: [], page: 0, size: 100, totalElements: 0 } }));
  await page.route('**/api/admin/sales?*', r => r.fulfill({ json: { sales: [sale, voided], page: 0, size: 100, totalElements: 2 } }));
  await page.goto('/admin/settings/sales-register', { waitUntil: 'networkidle' });
  await expect(page.locator('.sales-register .editable-table tbody tr')).toHaveCount(2);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // let table-fit settle
}

for (const width of [390, 800, 1280]) {
  test.describe(`direct sponsor sales at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('is titled Direct Sponsor Sales, shows Plot No, and has no void controls', async ({ page }) => {
      await open(page);
      await expect(page.locator('.sales-register h1')).toHaveText('Direct Sponsor Sales');
      const table = page.locator('.sales-register .editable-table');
      const headers = (await table.locator('thead th').allTextContents()).join('|'); // header cells also carry an icon name
      expect(headers).toContain('Plot No');
      expect(headers).not.toContain('Actions');
      await expect(table.locator('input, button')).toHaveCount(0);
      await expect(table.getByText('Voided')).toBeVisible(); // VOIDED rows still show their status
    });

    test('table and page do not scroll sideways', async ({ page }) => {
      await open(page);
      expect(await page.evaluate(audit)).toEqual([]);
    });
  });
}

test.describe('nav placement', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('sits under Plot Booking, not Finance & Cycles', async ({ page }) => {
    await open(page);
    const group = (name: string) => page.locator('.associate-sidebar__group-toggle', { hasText: name });
    await expect(group('Plot Booking')).toHaveAttribute('aria-expanded', 'true');
    const subnav = page.locator('.associate-sidebar__sublink', { hasText: 'Direct Sponsor Sales' });
    await expect(subnav).toHaveCount(1);
    await expect(page.locator('.associate-sidebar__sublink', { hasText: 'Sales Register' })).toHaveCount(0);
    await group('Finance & Cycles').click();
    await expect(page.locator('.associate-sidebar__sublink', { hasText: 'Closing Report' })).toBeVisible();
    await expect(page.locator('.associate-sidebar__sublink', { hasText: /Sales/ })).toHaveCount(0); // Finance has no sales item
  });
});
