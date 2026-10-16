import { expect, test } from '@playwright/test';

// Every screen each role can reach. Add new admin routes here so they are checked at phone width.
import { ROLES } from './routes';

for (const role of ROLES) for (const width of [360, 390]) {
  test.describe(`${role.name} at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });

    test.beforeEach(async ({ page, request }) => {
      const res = await request.post('/api/auth/login', {
        data: {
          userId: process.env[role.user] ?? role.defaults[0],
          password: process.env[role.pass] ?? role.defaults[1]
        }
      });
      const login = await res.json();
      await page.addInitScript(l => {
        localStorage.setItem('plotchain.auth.token', l.token);
        localStorage.setItem('plotchain.auth.mustChangePassword', 'false');
        localStorage.setItem('plotchain.auth.role', l.role);
      }, login);
    });

    for (const route of role.routes) {
      test(`${route} has no horizontal page overflow`, async ({ page }) => {
        await page.goto(route, { waitUntil: 'networkidle' });
        expect(new URL(page.url()).pathname).toBe(route);
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth
        }));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      });
    }

    if (role.name === 'admin') {
      test('book-plot table with plots does not widen the page', async ({ page }) => {
        await page.goto('/settings/book-plot', { waitUntil: 'networkidle' });
        const select = page.locator('.projects-plots__project-select select');
        const count = await select.locator('option').count();
        for (let i = 0; i < count; i++) {
          await select.selectOption({ index: i });
          await page.waitForTimeout(500);
          if (await page.locator('.projects-plots__table').count()) break;
        }
        const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        expect(w[0]).toBeLessThanOrEqual(w[1]);
      });

      test('compensation reward tier inputs stay usable', async ({ page }) => {
        await page.goto('/settings/compensation', { waitUntil: 'networkidle' });
        await page.getByText('Reward Tiers').first().click();
        const input = page.locator('.compensation-step .editable-table tbody tr input').first();
        await expect(input).toBeVisible();
        expect((await input.boundingBox())!.width).toBeGreaterThan(150);
      });
    }

    test('sidebar is an off-canvas drawer opened by the menu button', async ({ page }) => {
      await page.goto(role.home, { waitUntil: 'networkidle' });
      const sidebar = page.locator('.mobile-drawer .associate-sidebar');
      await expect(sidebar).toBeHidden();
      await page.locator('.mobile-topbar__menu').click();
      await expect(sidebar).toBeVisible();
      await page.locator('.mobile-drawer-backdrop').click({ position: { x: width - 5, y: 400 } });
      await expect(sidebar).toBeHidden();
    });
  });
}
