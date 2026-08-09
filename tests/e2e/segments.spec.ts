import { test, expect } from '@playwright/test';

/**
 * Pages segment (industries) - verifie ce qui existe REELLEMENT.
 *
 * Historique: ce fichier testait six pages par segment (/restaurants, /hotels,
 * /bars-cafes, /retail, /salons, /pharmacies) avec un h1 propre a chacune. Ces
 * pages n'existent plus:
 *   - les trois premieres sont des redirections 308 vers des ancres de
 *     /solutions (next.config.mjs, bloc redirects),
 *   - les trois autres n'ont ni page ni redirection (404), et retail/salons/
 *     pharmacies ne sont pas modelisees comme industries dans solutions/page.tsx.
 * Le test echouait donc en CI en lisant le h1 partage de /solutions la ou il
 * attendait un h1 par segment. Il est realigne sur la structure actuelle: une
 * page /solutions, un h1, quatre blocs industrie en h2, plus les redirections
 * heritees.
 */
test.describe('Pages segment (industries)', () => {
  test('/solutions se charge avec son titre et son CTA', async ({ page }) => {
    await page.goto('/solutions');

    await expect(page).toHaveTitle(/ATTABL/i);

    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toHaveText(/Une application\./i);

    const cta = page.locator('a[href*="signup"]').first();
    await expect(cta).toBeVisible();
  });

  // Les quatre industries reellement modelisees (INDUSTRIES dans
  // src/app/(marketing)/solutions/page.tsx). Fragments sans accent: le contrat
  // porte sur le bloc rendu, pas sur la ponctuation exacte de la copy.
  const industries = [
    { anchor: 'ind-restaurant', title: /Le restaurant/i },
    { anchor: 'ind-hotel', title: /Le service en chambre/i },
    { anchor: 'ind-qsr', title: /Le service rapide/i },
    { anchor: 'ind-bar', title: /Le comptoir qui compte/i },
  ];

  for (const industry of industries) {
    test(`bloc ${industry.anchor} present avec son titre`, async ({ page }) => {
      await page.goto('/solutions');

      const section = page.locator(`#${industry.anchor}`);
      await expect(section).toBeVisible({ timeout: 10000 });
      await expect(section.locator('h2').first()).toHaveText(industry.title);
    });
  }

  // Les anciennes URL par segment restent indexees et partagees: si une
  // redirection saute, un visiteur tombe sur un 404 sans que rien ne le signale.
  const legacyRoutes = [
    { from: '/restaurants', anchor: 'ind-restaurant' },
    { from: '/hotels', anchor: 'ind-hotel' },
    { from: '/quick-service', anchor: 'ind-qsr' },
    { from: '/fast-food', anchor: 'ind-qsr' },
    { from: '/bars-cafes', anchor: 'ind-bar' },
  ];

  for (const route of legacyRoutes) {
    test(`${route.from} redirige vers /solutions#${route.anchor}`, async ({ page }) => {
      await page.goto(route.from);

      await expect(page).toHaveURL(new RegExp(`/solutions#${route.anchor}$`));
      await expect(page.locator(`#${route.anchor}`)).toBeVisible({ timeout: 10000 });
    });
  }
});
