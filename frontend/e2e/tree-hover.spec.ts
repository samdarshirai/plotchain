import { expect, Page, test } from '@playwright/test';

const node = {
  id: 'hover-test', userId: 'VP00001', name: 'Corner associate', designation: null,
  kycStatus: 'VERIFIED', position: null, leftLegVolume: 0, rightLegVolume: 0,
  totalLeftBusiness: 0, totalRightBusiness: 0, skewedLegsFlag: false,
  stagnantFlag: false, plotBuyer: false, children: []
};
const details = {
  name: 'AssociateWithAVeryLongUnbrokenName'.repeat(3), userId: node.userId,
  joinedAt: '2025-01-01T00:00:00Z', leftMemberId: 'LeftMember'.repeat(10), rightMemberId: null,
  totalLeftMembers: 12, totalRightMembers: 8, activeLeftMembers: 10, activeRightMembers: 6,
  totalLeftBusiness: 123456789, totalRightBusiness: 987654321, totalSelfBusiness: 100000
};

async function openTree(page: Page, admin: boolean): Promise<void> {
  // All API responses are isolated fixtures; no running backend or account is required.
  await page.addInitScript(() => {
    const token = `test.${btoa(JSON.stringify({ exp: 4102444800 }))}.test`;
    localStorage.setItem('plotchain.auth.token', token);
    localStorage.setItem('plotchain.auth.role', 'ASSOCIATE');
    localStorage.setItem('plotchain.auth.admin.token', token);
    localStorage.setItem('plotchain.auth.admin.role', 'ADMIN');
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path.endsWith('/details')) json = details;
    else if (path.endsWith('/tree')) json = node;
    else if (path.endsWith('/setup-state')) json = { launchedAt: '2025-01-01', steps: [], canGoLive: true };
    else if (path.endsWith('/profile')) json = { name: node.name, userId: node.userId };
    else if (path === '/api/associates') json = [];
    else if (path.endsWith('/branding/public')) json = null;
    await route.fulfill({ json });
  });
  await page.goto(admin ? '/admin/settings/tree-explorer' : '/my-tree');
  await expect(page.locator('.tree-explorer__node-card')).toBeVisible();
  // Initial fit is animated. Wait for its completion before positioning the fixture.
  await expect(page.locator('.tree-explorer__canvas-inner--animate')).toHaveCount(0);
}

async function placeCard(page: Page, right: boolean, bottom: boolean): Promise<void> {
  await page.mouse.move(0, 0);
  await page.evaluate(({ right, bottom }) => {
    const inner = document.querySelector<HTMLElement>('.tree-explorer__canvas-inner')!;
    const card = document.querySelector<HTMLElement>('.tree-explorer__node-card')!;
    const wrap = document.querySelector('.tree-explorer__canvas-wrap')!.getBoundingClientRect();
    inner.style.transform = 'scale(0.8)';
    const rect = card.getBoundingClientRect();
    const left = right ? Math.min(wrap.right, innerWidth) - rect.width - 16 : wrap.left + 16;
    const top = bottom ? Math.min(wrap.bottom, innerHeight) - rect.height - 16 : wrap.top + 16;
    inner.style.transform = `translate(${left - rect.left}px, ${top - rect.top}px) scale(0.8)`;
  }, { right, bottom });
}

async function expectInsideViewport(page: Page): Promise<void> {
  const popup = page.locator('.tree-explorer__hover-card');
  await expect(popup).toContainText(details.name);
  await expect.poll(async () => popup.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 7.5 && rect.top >= 7.5 && rect.right <= innerWidth - 7.5 && rect.bottom <= innerHeight - 7.5;
  })).toBe(true);
  expect(await popup.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
}

for (const admin of [true, false]) {
  test(`${admin ? 'admin' : 'associate'} repositions async details and dismisses stale placement`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTree(page, admin);
    let releaseDetails!: () => void;
    const responseReady = new Promise<void>(resolve => { releaseDetails = resolve; });
    await page.route('**/tree/*/details', async route => {
      await responseReady;
      await route.fulfill({ json: details });
    });
    await placeCard(page, true, true);
    const card = page.locator('.tree-explorer__node-card');
    const popup = page.locator('.tree-explorer__hover-card');
    await card.hover();
    await expect(popup).toBeVisible();
    const loadingHeight = (await popup.boundingBox())!.height;
    releaseDetails();
    await expectInsideViewport(page);
    expect((await popup.boundingBox())!.height).toBeGreaterThan(loadingHeight);

    await popup.hover();
    await expect(popup).toBeVisible();
    await page.locator('.tree-explorer__zoom-controls button').first().click();
    await expect(popup).toHaveCount(0);

    await placeCard(page, true, true);
    await card.dispatchEvent('mouseenter');
    await expectInsideViewport(page);
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await expect(popup).toHaveCount(0);

    await card.dispatchEvent('mouseenter');
    await expectInsideViewport(page);
    await page.setViewportSize({ width: 1300, height: 800 });
    await expect(popup).toHaveCount(0);
  });

  for (const width of [1440, 390]) {
    test(`${admin ? 'admin' : 'associate'} tree details fit all corners at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await openTree(page, admin);
      for (const right of [false, true]) for (const bottom of [false, true]) {
        await placeCard(page, right, bottom);
        const card = page.locator('.tree-explorer__node-card');
        await card.dispatchEvent('mouseenter');
        await expectInsideViewport(page);
        await page.screenshot({ path: testInfo.outputPath(`corner-${right}-${bottom}.png`) });
        await card.dispatchEvent('mouseleave');
        await expect(page.locator('.tree-explorer__hover-card')).toHaveCount(0);
      }
    });
  }

  test(`${admin ? 'admin' : 'associate'} popup can scroll on a short screen`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 240 });
    await openTree(page, admin);
    await placeCard(page, true, false);
    await page.locator('.tree-explorer__node-card').dispatchEvent('mouseenter');
    await expectInsideViewport(page);
    const popup = page.locator('.tree-explorer__hover-card');
    await popup.hover();
    await page.mouse.wheel(0, 200);
    await expect.poll(() => popup.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expectInsideViewport(page);
    await page.mouse.move(0, 0);
    await expect(popup).toHaveCount(0);
  });
}
