import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflowing = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    let count = 0;
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > vw + 1) count++;
    });
    return count;
  });
  expect(overflowing, 'Elements overflowing viewport horizontally').toBe(0);
}

for (const vp of viewports) {
  test(`Tenant menu renders without overflow at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/sites/blutable', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
}
