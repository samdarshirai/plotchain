import { expect, test } from '@playwright/test';

const booking = {
  id: 'cancelled-layout-fixture', status: 'CANCELLED', bookedAt: '2026-10-01T12:00:00Z', cancelledAt: '2026-10-10T12:00:00Z',
  associateCode: 'VP00001', associateName: 'Associate With A Longer Display Name',
  buyerName: 'Buyer With A Longer Display Name', buyerPhone: '9876543210',
  projectName: 'A Residential Project With A Rather Long Name For Testing Row Wrapping', plotNo: 'A-101',
  discount: 10000, totalAmount: 1500000, paidAmount: 500000
};

for (const width of [390, 1024, 1440]) {
  test(`cancelled bookings keep long details readable and rows compact at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const response = await request.post('/api/auth/login', {
      data: { userId: process.env['ADMIN_USER'] ?? 'admin', password: process.env['ADMIN_PASSWORD'] ?? 'ChangeMe123!' }
    });
    expect(response.ok()).toBeTruthy();
    await page.addInitScript(login => {
      localStorage.setItem('plotchain.auth.token', login.token);
      localStorage.setItem('plotchain.auth.role', login.role);
      localStorage.setItem('plotchain.auth.mustChangePassword', 'false');
    }, await response.json());
    await page.route('**/api/admin/bookings?*', async route => {
      if (new URL(route.request().url()).searchParams.get('status') !== 'CANCELLED') { await route.continue(); return; }
      await route.fulfill({ json: { bookings: [booking], page: 0, size: 20, totalElements: 1 } });
    });
    await page.goto('/settings/bookings-emi?tab=cancelled', { waitUntil: 'networkidle' });
    const row = page.locator('.cancelled-bookings tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(booking.buyerName);
    await expect(row).toContainText(booking.projectName);
    await page.screenshot({ path: testInfo.outputPath('cancelled-bookings.png'), fullPage: true });
    const bounds = await row.boundingBox();
    if (width > 768) { expect(bounds!.height).toBeLessThanOrEqual(72); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
