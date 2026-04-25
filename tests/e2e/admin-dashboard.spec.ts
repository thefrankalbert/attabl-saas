import { test, expect } from '@playwright/test';

/**
 * Admin dashboard responsive regression tests.
 * Runs against the 3 canonical viewports for ATTABL:
 *   - mobile          375x812  (iPhone SE)
 *   - tablet-land     1194x834 (iPad Pro 11" landscape - primary usage)
 *   - desktop         1440x900 (standard desktop)
 *
 * These tests require an authenticated session. They run in CI after
 * ALLOW_DEV_AUTH_BYPASS=true is set (see .env.local.example).
 *
 * What is checked:
 *   1. No horizontal overflow at any viewport
 *   2. MetricsRow (4 KPI cards) is rendered and visible
 *   3. OverviewChart section is rendered
 *   4. LiveOrdersFeed section is rendered
 *   5. On tablet-land and desktop: both columns are side-by-side (2-col grid)
 *   6. On mobile: single-column stacked layout
 */

const ADMIN_URL = '/sites/blutable/admin';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet-land', width: 1194, height: 834 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const count = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    let n = 0;
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 2) n++;
    });
    return n;
  });
  expect(count, 'Elements overflowing viewport horizontally').toBe(0);
}

for (const vp of VIEWPORTS) {
  test.describe(`Dashboard @ ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded' });
      // Wait for the dashboard content to hydrate
      await page.waitForSelector('[data-testid="metrics-row"], .grid', { timeout: 10000 });
    });

    test('no horizontal overflow', async ({ page }) => {
      await assertNoHorizontalOverflow(page);
    });

    test('MetricsRow renders 4 KPI cards', async ({ page }) => {
      // Each KPI card is a Button inside the MetricsRow grid
      // The grid has 4 children buttons
      const metricsGrid = page
        .locator('.grid')
        .filter({
          has: page.locator('button').nth(3),
        })
        .first();
      await expect(metricsGrid).toBeVisible();
    });

    test('OverviewChart section is visible', async ({ page }) => {
      // OverviewChart renders an SVG inside a card
      const chart = page.locator('svg').first();
      await expect(chart).toBeVisible();
    });

    test('LiveOrdersFeed section is visible', async ({ page }) => {
      // The feed header has a Zap icon + title
      const feedSection = page.getByText(/commandes/i).first();
      await expect(feedSection).toBeVisible();
    });

    if (vp.name === 'tablet-land' || vp.name === 'desktop') {
      test('2-column layout is active', async ({ page }) => {
        // The main grid should have 2 visible columns side-by-side.
        // We check that the right column (orders feed) is NOT below the chart
        // by comparing their bounding boxes.
        const chartSection = page.locator('svg').first();
        const feedTitle = page.getByText(/commandes/i).first();

        const chartBox = await chartSection.boundingBox();
        const feedBox = await feedTitle.boundingBox();

        expect(chartBox).not.toBeNull();
        expect(feedBox).not.toBeNull();

        if (chartBox && feedBox) {
          // In 2-col layout: feed column starts at a larger x than chart column
          // (they are side by side, not stacked)
          expect(feedBox.x).toBeGreaterThan(chartBox.x + chartBox.width / 2);
        }
      });
    }

    if (vp.name === 'mobile') {
      test('single-column stacked layout', async ({ page }) => {
        const chartSection = page.locator('svg').first();
        const feedTitle = page.getByText(/commandes/i).first();

        const chartBox = await chartSection.boundingBox();
        const feedBox = await feedTitle.boundingBox();

        expect(chartBox).not.toBeNull();
        expect(feedBox).not.toBeNull();

        if (chartBox && feedBox) {
          // In single-col: feed is BELOW chart (larger y, similar x)
          expect(feedBox.y).toBeGreaterThan(chartBox.y + chartBox.height);
        }
      });
    }
  });
}
