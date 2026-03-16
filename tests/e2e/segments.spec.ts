import { test, expect } from '@playwright/test';

/**
 * Segment marketing pages — verifies each vertical page loads correctly.
 * Tests the segment terminology system from the visitor's perspective.
 */
test.describe('Segment Marketing Pages', () => {
  const segments = [
    { path: '/restaurants', heading: /précision|excellence/i },
    { path: '/hotels', heading: /service en chambre|room service/i },
    { path: '/bars-cafes', heading: /comptoir|terrasse/i },
    { path: '/retail', heading: /catalogue|commerce/i },
    { path: '/salons', heading: /élégance|gestion/i },
    { path: '/pharmacies', heading: /pharmacie|connectée/i },
  ];

  for (const segment of segments) {
    test(`${segment.path} page loads with correct content`, async ({ page }) => {
      await page.goto(segment.path);

      // Page should load successfully
      await expect(page).toHaveTitle(/ATTABL/i);

      // Hero heading should be visible
      const heading = page.locator('h1').first();
      await expect(heading).toBeVisible({ timeout: 10000 });
      await expect(heading).toHaveText(segment.heading);

      // Should have a signup CTA
      const cta = page.locator('a[href*="signup"]').first();
      await expect(cta).toBeVisible();
    });
  }

  test('landing page segments section lists all verticals', async ({ page }) => {
    await page.goto('/');

    // Wait for segments section to load
    await page.waitForSelector('text=Conçu pour votre activité', { timeout: 10000 });

    // Verify new segments are present
    await expect(page.locator('text=Commerces')).toBeVisible();
    await expect(page.locator('text=Salons')).toBeVisible();
    await expect(page.locator('text=Pharmacies')).toBeVisible();
  });
});
