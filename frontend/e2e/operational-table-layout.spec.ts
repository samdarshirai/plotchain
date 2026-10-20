import { expect, test } from '@playwright/test';

for (const screen of ['sales-register', 'associate-directory']) for (const width of [390, 1024, 1440]) {
  test(`${screen} has compact aligned rows at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const loginResponse = await request.post('/api/auth/login', {
      data: { userId: process.env['ADMIN_USER'] ?? 'admin', password: process.env['ADMIN_PASSWORD'] ?? 'ChangeMe123!' }
    });
    expect(loginResponse.ok()).toBeTruthy();
    await page.addInitScript(login => {
      localStorage.setItem('plotchain.auth.token', login.token);
      localStorage.setItem('plotchain.auth.role', login.role);
      localStorage.setItem('plotchain.auth.mustChangePassword', 'false');
    }, await loginResponse.json());
    await page.route('**/api/admin/sales?*', route => route.fulfill({ json: {
      sales: [{ id: 'layout-sale', projectName: 'A Residential Project With A Rather Long Name For Testing Table Wrapping',
        buyerName: 'Buyer With A Longer Display Name', buyerPhone: '9876543210', amount: 1500000, legCredited: 'L',
        note: 'A long note that should remain readable without expanding the entire sales row', status: 'RECORDED', recordedAt: '2026-10-01T12:00:00Z' }],
      page: 0, size: 20, totalElements: 1
    } }));
    await page.route('**/api/admin/associates?*', route => route.fulfill({ json: {
      associates: [{ id: 'layout-associate', userId: 'VP00001', name: 'Associate With A Longer Display Name For Testing Table Wrapping',
        sponsorUserId: 'VP00002', position: 'L', status: 'ACTIVE', kycStatus: 'VERIFIED', joinedAt: '2026-10-01T12:00:00Z' }],
      page: 0, size: 20, totalElements: 1
    } }));
    await page.goto(`/admin/settings/${screen}`, { waitUntil: 'networkidle' });
    const table = page.locator(`.${screen} .editable-table`);
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('table.png'), fullPage: true });
    if (width > 768 || screen === 'associate-directory') {
      expect((await table.locator('tbody tr').boundingBox())!.height).toBeLessThanOrEqual(72);
      const aligned = await table.evaluate(el => {
        const headers = Array.from(el.querySelectorAll('thead th'));
        const cells = Array.from(el.querySelectorAll('tbody tr:first-child td'));
        return cells.every((cell, index) => Math.abs(cell.getBoundingClientRect().left - headers[index].getBoundingClientRect().left) < 1);
      });
      expect(aligned).toBeTruthy();
    }
    if (screen === 'sales-register') {
      if (width > 768) {
        expect(await table.locator('tbody td:nth-child(7) > span').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
      }
      await table.locator('input').fill('Review reason');
      await expect(table.locator('input')).toHaveValue('Review reason');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
