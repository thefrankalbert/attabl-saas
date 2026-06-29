import { defineConfig, devices } from '@playwright/test';

/**
 * Config Playwright DEDIEE au harnais "journee complete".
 *
 * Isolee de la suite existante: testDir pointe sur tests/journeys uniquement.
 * La config racine (playwright.config.ts) scanne tests/e2e et n'inclut donc
 * jamais ces fichiers. Rien de l'existant n'est modifie.
 *
 * Execution: voir tests/journeys/README.md
 *   JOURNEY_BASE_URL=http://localhost:3000 \
 *   npx playwright test --config tests/journeys/playwright.config.ts
 *
 * workers=1 et fullyParallel=false: une journee de travail est ORDONNEE et
 * partage un meme tenant seede. On veut un deroule sequentiel, pas du parallele.
 */
const baseURL = process.env.JOURNEY_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: __dirname,
  // Garde-fou fail-closed: avorte tout le run si on cible la prod (app ou seed)
  // ou si la confirmation base-de-test (JOURNEY_CONFIRM_TEST_DB=yes) manque.
  globalSetup: require.resolve('./fixtures/global-setup'),
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-journeys', open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'journeys', use: { ...devices['Desktop Chrome'] } }],
});
