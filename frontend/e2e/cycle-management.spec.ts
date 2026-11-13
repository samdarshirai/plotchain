import { expect, test } from '@playwright/test';

for (const width of [390, 1024, 1440, 1920]) {
  test(`cycle gross income and column layout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('plotchain.auth.admin.token', `e30.${btoa(JSON.stringify({ exp: 4102444800 }))}.test`);
      localStorage.setItem('plotchain.auth.admin.role', 'ADMIN');
      localStorage.setItem('plotchain.auth.admin.mustChange', 'false');
    });
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/associates/me/profile') return route.fulfill({ json: { name: 'Admin', userId: 'admin' } });
      if (url.pathname === '/api/company/branding/public') return route.fulfill({ json: {
        displayName: 'Viraj Acres', tagline: '', primaryColor: '#C6A227', secondaryColor: '#731D2C', hasSquareLogo: false, hasWideLogo: false
      } });
      if (url.pathname === '/api/admin/cycles') return route.fulfill({ json: {
        cycles: [
          { id: 'closed', periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'CLOSED' },
          { id: 'open', periodStart: '2026-11-01', periodEnd: null, status: 'OPEN' }
        ], page: 0, size: 100, totalElements: 2
      } });
      if (url.pathname === '/api/admin/stats') return route.fulfill({ json: { currentCycle: {
        periodStart: '2026-11-01', directIncome: 100, matchingIncome: 200, totalIncome: 300,
        directGrossIncome: 123456789, matchingGrossIncome: 1000, totalGrossIncome: 123457789,
        previousCycleTotalIncome: 300, previousCycleTotalGrossIncome: 100000000,
        newAssociatesThisCycle: 3, salesThisCycle: 4, revenueThisCycle: 100000000
      } } });
      if (/\/api\/admin\/cycles\/(closed|open)$/.test(url.pathname)) return route.fulfill({ json: {
        incomeTypeTotals: [{ incomeType: 'DIRECT', totalGross: 123456789, totalNet: 100 }],
        totalGross: 123456789, totalNet: 100, totalBusiness: 987654321, tripExpense: 123456789
      } });
      return route.fulfill({ json: { launchedAt: '2026-01-01', companyName: 'Layout test' } });
    });
    await page.goto('/admin/settings/cycle-management', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet]')).every(link => link.media !== 'print'));
    const table = page.locator('.cycle-management .editable-table');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table.locator('tbody tr:first-child td').nth(4)).toHaveText('₹12,34,56,789');
    await expect(table.locator('tfoot td').nth(4)).toHaveText('₹24,69,13,578');
    await expect(page.locator('.cycle-management__income-note')).toContainText('before TDS and admin deductions');
    const button = page.getByRole('button', { name: 'Credit Wallets', exact: true });
    await expect(button).toBeVisible();
    if (width > 768) {
      await expect(table).not.toHaveClass(/table--stacked/);
      const card = page.locator('.cycle-management .card');
      expect(await card.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      const aligned = await table.evaluate(el => {
        const headers = Array.from(el.querySelectorAll('thead th'));
        const cells = Array.from(el.querySelectorAll('tbody tr:first-child td'));
        return cells.every((cell, i) => Math.abs(cell.getBoundingClientRect().left - headers[i].getBoundingClientRect().left) < 1);
      });
      expect(aligned).toBe(true);
      const bounds = await table.locator('tbody tr:first-child td').evaluateAll(cells => cells.every(cell => cell.scrollWidth <= cell.clientWidth + 1));
      expect(bounds).toBe(true);
      await expect(button).toBeInViewport();
      const clipped = await button.evaluate(el => el.scrollWidth > el.clientWidth);
      expect(clipped).toBe(false);
    } else {
      await expect(table.locator('thead')).toBeHidden();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('cycle-management.png'), fullPage: true });
  });
}
