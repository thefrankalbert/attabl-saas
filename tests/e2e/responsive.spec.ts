import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Responsive visual regression tests.
 *
 * Takes screenshots of key admin pages across 4 viewports to catch
 * layout regressions introduced by CSS changes (container queries, etc.).
 *
 * Prerequisites:
 *   - Dev server running on localhost:3000
 *   - E2E_EMAIL and E2E_PASSWORD env vars set
 *   - A tenant with slug "demo" exists
 *
 * First run creates baseline screenshots in tests/e2e/responsive.spec.ts-snapshots/.
 * Subsequent runs compare against baselines. Update with:
 *   pnpm test:e2e:responsive --update-snapshots
 */

const viewports = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'ipad-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const pages = [
  { name: 'dashboard', path: '/sites/demo/admin' },
  { name: 'menus', path: '/sites/demo/admin/menus' },
  { name: 'orders', path: '/sites/demo/admin/orders' },
  { name: 'settings', path: '/sites/demo/admin/settings' },
  { name: 'pos', path: '/sites/demo/admin/pos' },
  { name: 'kitchen', path: '/sites/demo/admin/kitchen' },
  { name: 'inventory', path: '/sites/demo/admin/inventory' },
  { name: 'reports', path: '/sites/demo/admin/reports' },
] as const;

const AUTH_FILE = path.join(__dirname, '.auth', 'admin.json');

// Run all tests serially — auth must complete before screenshots
test.describe.serial('Responsive visual regression', () => {
  test('authenticate admin user', async ({ page }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;

    if (!email || !password) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD env vars are required');
      return;
    }

    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Fill login form
    await page.locator('input[type="email"], input[name="email"]').fill(email);
    await page.locator('input[type="password"], input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Wait for redirect to admin (or any authenticated page)
    await page.waitForURL(/\/(sites\/|admin)/, { timeout: 30_000 });

    // Save auth state for reuse
    const authDir = path.dirname(AUTH_FILE);
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    await page.context().storageState({ path: AUTH_FILE });
  });

  for (const vp of viewports) {
    for (const pg of pages) {
      test(`${pg.name} @ ${vp.name} (${vp.width}x${vp.height})`, async ({ browser }) => {
        // Skip if auth file doesn't exist (auth test failed/skipped)
        if (!fs.existsSync(AUTH_FILE)) {
          test.skip(true, 'Auth setup did not complete — skipping screenshot');
          return;
        }

        // Create a new context with saved auth state
        const context = await browser.newContext({
          storageState: AUTH_FILE,
          viewport: { width: vp.width, height: vp.height },
        });
        const page = await context.newPage();

        try {
          // Navigate
          await page.goto(pg.path, { waitUntil: 'networkidle', timeout: 30_000 });

          // Wait for content to render (hydration + lazy loads)
          await page.waitForTimeout(1000);

          // Dismiss any loading spinners
          await page
            .waitForFunction(() => !document.querySelector('.animate-pulse, .animate-spin'), {
              timeout: 10_000,
            })
            .catch(() => {
              // Some pages may keep subtle pulse animations — proceed anyway
            });

          // Screenshot comparison
          await expect(page).toHaveScreenshot(`${pg.name}-${vp.name}.png`, {
            fullPage: true,
            maxDiffPixelRatio: 0.01,
            animations: 'disabled',
          });
        } finally {
          await context.close();
        }
      });
    }
  }
});
