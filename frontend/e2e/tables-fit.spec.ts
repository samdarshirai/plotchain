import { expect, test, Page } from '@playwright/test';
import { ROLES } from './routes';

// Project rule (CLAUDE.md): no table scrolls sideways. At every width each visible table must fit its
// container and the page, no table may sit in a horizontal scroller, and a stacked table must keep its labels.
// Needs the full stack up: npm run test:mobile

async function login(page: Page, request: any, role: (typeof ROLES)[number]) {
  const res = await request.post('/api/auth/login', {
    data: { userId: process.env[role.user] ?? role.defaults[0], password: process.env[role.pass] ?? role.defaults[1] }
  });
  const l = await res.json();
  const p = role.name === 'admin' ? 'plotchain.auth.admin.' : 'plotchain.auth.';
  const mustChange = role.name === 'admin' ? 'mustChange' : 'mustChangePassword';
  await page.addInitScript(a => {
    localStorage.setItem(a.p + 'token', a.token);
    localStorage.setItem(a.p + a.mustChange, 'false');
    localStorage.setItem(a.p + 'role', a.role);
  }, { ...l, p, mustChange });
}

// Runs in the page. Returns one message per broken rule.
function audit(): string[] {
  const bad: string[] = [];
  const container = (t: Element) => {
    let el = t.parentElement;
    while (el && ['inline', 'contents'].includes(getComputedStyle(el).display)) el = el.parentElement;
    return el;
  };
  document.querySelectorAll('table').forEach((t, i) => {
    if (!(t as HTMLElement).offsetParent) return; // hidden
    const name = `table#${i}(${t.className || 'plain'})`;
    const c = container(t);
    if (c && c.scrollWidth > c.clientWidth + 1) bad.push(`${name}: container ${c.scrollWidth} > ${c.clientWidth}`);
    for (let el = t.parentElement; el && el !== document.body; el = el.parentElement) {
      const ox = getComputedStyle(el).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) bad.push(`${name}: scrolls inside .${el.className}`);
    }
    if (t.classList.contains('table--stacked')) {
      const unlabeled = Array.from(t.querySelectorAll('tbody tr')).some(r =>
        r.children.length > 1 && Array.from(r.children).some(td => !td.hasAttribute('colspan') && !td.hasAttribute('data-label') && !td.classList.contains('table__sno')) && t.tHead);
      if (unlabeled) bad.push(`${name}: stacked cell without data-label`);
    }
  });
  const d = document.documentElement;
  if (d.scrollWidth > d.clientWidth) bad.push(`page ${d.scrollWidth} > ${d.clientWidth}`);
  return bad;
}

for (const role of ROLES) for (const width of [390, 800, 1280]) {
  test.describe(`${role.name} tables at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(({ page, request }) => login(page, request, role));

    for (const route of role.routes) {
      test(`${route} tables fit`, async ({ page }) => {
        await page.goto(route, { waitUntil: 'networkidle' });
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // let table-fit settle
        expect(await page.evaluate(audit)).toEqual([]);
      });
    }
  });
}

// The two screens fixed for "card instead of table": with a realistic row they must stay real tables on a laptop.
test.describe('admin directory + register stay tables at 1280px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.beforeEach(({ page, request }) => login(page, request, ROLES[0]));

  for (const screen of ['sales-register', 'associate-directory']) {
    test(`${screen} is not stacked`, async ({ page }) => {
      await page.route('**/api/admin/sales?*', r => r.fulfill({ json: {
        sales: [{ id: 's1', projectName: 'A Residential Project With A Rather Long Name', buyerName: 'Buyer With A Longer Display Name',
          buyerPhone: '9876543210', amount: 1500000, legCredited: 'L', note: 'A long note', status: 'RECORDED', recordedAt: '2026-10-01T12:00:00Z' }],
        page: 0, size: 20, totalElements: 1 } }));
      await page.route('**/api/admin/associates?*', r => r.fulfill({ json: {
        associates: [{ id: 'a1', userId: 'VP00001', name: 'Associate With A Longer Display Name', sponsorUserId: 'VP00002',
          position: 'L', status: 'ACTIVE', kycStatus: 'VERIFIED', joinedAt: '2026-10-01T12:00:00Z' }],
        page: 0, size: 20, totalElements: 1 } }));
      await page.goto(`/admin/settings/${screen}`, { waitUntil: 'networkidle' });
      await expect(page.locator(`.${screen} .editable-table tbody tr`)).toHaveCount(1);
      await expect(page.locator(`.${screen} .editable-table`)).not.toHaveClass(/table--stacked/);
      expect(await page.evaluate(audit)).toEqual([]);
    });
  }
});
