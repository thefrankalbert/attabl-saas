import { test, expect } from '@playwright/test';

/**
 * Basic smoke test — verifies the landing page loads correctly.
 * This is the foundation for future E2E tests.
 */
test.describe('Landing Page', () => {
  test('should load the home page successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ATTABL/i);
  });

  test('should display the main heading', async ({ page }) => {
    await page.goto('/');
    // The landing page should have at least one visible heading
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
  });

  test('should have a signup/CTA button', async ({ page }) => {
    await page.goto('/');
    // Look for a call-to-action link/button
    const cta = page
      .locator('a[href*="signup"], a[href*="register"], button:has-text("essai")')
      .first();
    await expect(cta).toBeVisible();
  });
});
