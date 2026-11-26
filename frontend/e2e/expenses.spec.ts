import { expect, test, Page } from '@playwright/test';
import { audit } from './table-audit';

// Invoice > Add / View Expense (/admin/settings/invoice-expenses). API fully mocked, so only the dev server is needed
// (BASE_URL=http://localhost:4201 npx playwright test e2e/expenses.spec.ts).

const ROW = {
  id: 'e1', expenseDate: '2026-11-01', expenseTypeId: 't1', expenseTypeName: 'Office Rent', projectName: 'A Residential Project With A Long Name',
  associateUserId: 'VP00001', payTo: 'Landlord With A Longer Name', amount: 12500000, payMode: 'BANK_TRANSFER',
  bankName: 'State Bank Of India', txnNo: 'TXN-0012345678', remarks: 'A fairly long remark about this expense so the column has real text'
};

let posted: any[];

async function setup(page: Page) {
  posted = [];
  await page.addInitScript(() => {
    localStorage.setItem('plotchain.auth.admin.token', 'e30.' + btoa(JSON.stringify({ exp: 4102444800 })) + '.x'); // fake JWT, exp year 2100
    localStorage.setItem('plotchain.auth.admin.mustChange', 'false');
    localStorage.setItem('plotchain.auth.admin.role', 'ADMIN');
  });
  await page.route('**/api/**', r => r.fulfill({ json: { name: 'Admin' } }));
  await page.route('**/api/company/setup-state', r => r.fulfill({ json: { launchedAt: '2026-01-01T00:00:00Z' } }));
  await page.route('**/api/admin/expense-types', r => r.fulfill({ json: [{ id: 't1', name: 'Office Rent', status: 'ACTIVE' }] }));
  await page.route('**/api/company/projects', r => r.fulfill({ json: [{ id: 'p1', name: 'Project One' }] }));
  await page.route('**/api/admin/cycles?*', r => r.fulfill({ json: { cycles: [], page: 0, size: 100, totalElements: 0 } }));
  await page.route('**/api/admin/expenses*', r => {
    if (r.request().method() === 'POST') { posted.push(r.request().postDataJSON()); return r.fulfill({ json: ROW }); }
    return r.fulfill({ json: [ROW] });
  });
  await page.goto('/admin/settings/invoice-expenses', { waitUntil: 'networkidle' });
  await expect(page.locator('.invoice-expenses .editable-table tbody tr').first()).toBeVisible();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const width of [390, 800, 1280]) {
  test.describe(`expenses at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });
    test.beforeEach(({ page }) => setup(page));

    test('table fits, page does not scroll sideways', async ({ page }) => {
      expect(await page.evaluate(audit)).toEqual([]);
      expect(await noSideScroll(page)).toBe(true);
    });

    test('Add popup fits the viewport with the right column count', async ({ page }) => {
      await page.locator('.invoice-expenses__add').click();
      const modal = page.locator('.invoice-expenses__modal');
      await expect(modal).toBeVisible();
      const box = (await modal.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
      expect(await modal.evaluate(m => m.scrollWidth <= m.clientWidth)).toBe(true);
      await expect(page.locator('.invoice-expenses__modal-submit')).toBeVisible();
      const cols = await page.locator('.invoice-expenses__modal-field').evaluateAll(els =>
        new Set(els.map(e => Math.round(e.getBoundingClientRect().left))).size);
      expect(cols).toBe(width >= 900 ? 3 : width >= 768 ? 2 : 1);
    });
  });
}

test.describe('expenses at 1280px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.beforeEach(({ page }) => setup(page));

  test('stays a real table', async ({ page }) => {
  });

  test('empty submit shows errors and posts nothing', async ({ page }) => {
    await page.locator('.invoice-expenses__add').click();
    await page.locator('.invoice-expenses__modal-submit').click();
    await expect(page.locator('.invoice-expenses__modal app-error-summary')).toContainText(/Expense date|Expense type|Pay to|Amount/);
    expect(posted).toEqual([]);
  });

  test('non-cash mode requires bank + txn; cash does not; valid submit posts payload', async ({ page }) => {
    const m = page.locator('.invoice-expenses__modal');
    await page.locator('.invoice-expenses__add').click();
    await m.locator('input[formControlName=expenseDate]').fill('2026-11-02');
    await m.locator('select[formControlName=expenseTypeId]').selectOption('t1');
    await m.locator('input[formControlName=payTo]').fill('  Vendor  ');
    await m.locator('input[formControlName=amount]').fill('1500.5');

    await m.locator('select[formControlName=payMode]').selectOption({ index: 1 }); // first non-CASH mode
    await m.locator('.invoice-expenses__modal-submit').click();
    expect(posted).toEqual([]); // bank + txn now required

    await m.locator('select[formControlName=payMode]').selectOption('CASH');
    await m.locator('.invoice-expenses__modal-submit').click();
    await expect(m).toBeHidden();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      expenseDate: '2026-11-02', expenseTypeId: 't1', payTo: 'Vendor', amount: 1500.5,
      payMode: 'CASH', bankName: null, txnNo: null, projectId: null, remarks: null
    });
  });
});
