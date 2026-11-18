/**
 * Parcours 9: aucun ecran casse pour le restaurateur.
 *
 * Garde-fou ne en novembre 2026, apres trois casses vues par le proprietaire
 * sur des ecrans pourtant "verts" en CI:
 *  - photo d'un plat: la barre Recadrer / Remplacer / Supprimer sortait de la
 *    carte dans la galerie (on ne voyait que la corbeille et "S");
 *  - fiche commande a 1024 px: un avertissement place comme troisieme colonne
 *    ecrasait la commande a 70 px, et le bas du panneau de paiement (Carte,
 *    Enregistrer le paiement, Offrir) etait coupe, inaccessible;
 *  - "Carte (terminal)" qui sortait de son bouton.
 *
 * Chaque assertion MESURE la page rendue (debordement, libelle coupe,
 * controle recouvert) aux cinq largeurs de reference. Base LOCALE de test.
 *
 * Limite assumee: le harnais sert l'app avec `next dev` (Turbopack). Il attrape
 * les casses de mise en page, pas les ecarts propres au CSS minifie de
 * production: la regle 11 impose toujours une verification sur
 * `pnpm build && pnpm start` avant de fusionner un changement responsive.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { hasSeedEnv, journeyEnv } from './fixtures/env';
import { OWNER, loginPersona } from './fixtures/personas';
import {
  seedTenantWithMenu,
  seedStaffForTenant,
  seedOrderRow,
  teardownTenantBySlug,
} from './fixtures/seed';
import { LARGEURS, viewport, mesurerCasse, controleAtteignable } from './fixtures/visual';

const SLUG = journeyEnv.tenantSlug;
const PHOTO = path.join(__dirname, '../../public/icons/icon-512.png');

let orderId = '';
let session: Awaited<ReturnType<Awaited<ReturnType<typeof loginPersona>>['storageState']>>;

/**
 * Outils de developpement (overlay Next, barre de retours agentation): absents
 * en production, ils recouvrent le bas a droite de l'ecran en dev (bouton
 * "Suivant", lien "Analyse" de la barre du bas) et faussent les mesures.
 */
async function masquerOutilsDev(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent =
        'nextjs-portal, [data-agentation-portal], [data-feedback-toolbar] { display: none !important; }';
      document.head.appendChild(style);
    });
  });
}

async function contexteAnonyme(browser: Browser, width: number): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: viewport(width) });
  await masquerOutilsDev(ctx);
  return ctx;
}

async function contexteConnecte(browser: Browser, width: number): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: viewport(width), storageState: session });
  await masquerOutilsDev(ctx);
  // Le restaurant de test n'a pas fini sa configuration: la fenetre "Configuration
  // incomplete" couvrirait la page mesuree. Meme geste que "Plus tard".
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('attabl_onboarding_dismissed', 'true');
    } catch {
      // stockage indisponible: la fenetre s'affichera, le test le montrera
    }
  });
  return ctx;
}

/** Ouvre un contexte, execute `fn`, et le ferme meme si une assertion echoue. */
async function avec(
  ouvrir: Promise<BrowserContext>,
  fn: (ctx: BrowserContext) => Promise<void>,
): Promise<void> {
  const ctx = await ouvrir;
  try {
    await fn(ctx);
  } finally {
    await ctx.close();
  }
}

/**
 * Attendre le contenu, pas un delai fixe: sous `next dev` une premiere
 * compilation depasse facilement 2 s et l'on mesurerait le squelette.
 */
async function attendreChargement(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 60_000 });
  await page.waitForTimeout(500);
}

test.describe.serial('09 - Aucun ecran casse', () => {
  test.beforeAll(async () => {
    test.skip(!hasSeedEnv(), 'JOURNEY_SUPABASE_URL/SERVICE_ROLE_KEY requis (base de TEST).');
    const seeded = await seedTenantWithMenu();
    await seedStaffForTenant(seeded.tenantId, [OWNER]);
    orderId = await seedOrderRow(seeded.tenantId, { orderNumber: 'JT-CASSE-001' });
    const api = await loginPersona(OWNER);
    session = await api.storageState();
    await api.dispose();
  });

  test.afterAll(async () => {
    if (hasSeedEnv()) await teardownTenantBySlug();
  });

  const PAGES = ['', '/items', '/categories', '/menus', '/orders', '/users', '/settings'];

  for (const chemin of PAGES) {
    test(`admin${chemin || ' (tableau de bord)'}: ni debordement ni libelle coupe`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      for (const width of LARGEURS) {
        await avec(contexteConnecte(browser, width), async (ctx) => {
          const page = await ctx.newPage();
          await page.goto(`/sites/${SLUG}/admin${chemin}`, { waitUntil: 'domcontentloaded' });
          await page.locator('main#main-content').waitFor();
          await attendreChargement(page);
          const m = await mesurerCasse(page);
          expect(m.debordementX, `${chemin} a ${width}px: la page defile de cote`).toBe(0);
          expect(m.libellesCoupes, `${chemin} a ${width}px: libelles coupes`).toEqual([]);
        });
      }
    });
  }

  for (const [nom, chemin] of [
    ['vitrine: accueil', `/sites/${SLUG}`],
    ['vitrine: carte', `/sites/${SLUG}/menu`],
  ] as const) {
    test(`${nom}: ni debordement ni libelle coupe`, async ({ browser }) => {
      test.setTimeout(240_000);
      for (const width of LARGEURS) {
        await avec(contexteAnonyme(browser, width), async (ctx) => {
          const page = await ctx.newPage();
          await page.goto(chemin, { waitUntil: 'domcontentloaded' });
          await attendreChargement(page);
          const m = await mesurerCasse(page);
          expect(m.debordementX, `${nom} a ${width}px: la page defile de cote`).toBe(0);
          expect(m.libellesCoupes, `${nom} a ${width}px: libelles coupes`).toEqual([]);
        });
      }
    });
  }

  // Outil de conformite (axe-core, Deque): regles WCAG 2.2 qui touchent la mise
  // en page. Les autres ecarts releves par axe (contrastes du theme, noms
  // accessibles des selecteurs) font l'objet d'un chantier a part.
  const REGLES_AXE = ['target-size', 'meta-viewport', 'scrollable-region-focusable'];
  for (const [nom, chemin, connecte] of [
    ['connexion', '/login', false],
    ['inscription', '/signup', false],
    ['tableau de bord', `/sites/${SLUG}/admin`, true],
    ['commandes', `/sites/${SLUG}/admin/orders`, true],
  ] as const) {
    test(`axe-core (${REGLES_AXE.join(', ')}): ${nom}`, async ({ browser }) => {
      test.setTimeout(120_000);
      for (const width of [375, 1280]) {
        const ouvrir = connecte
          ? contexteConnecte(browser, width)
          : contexteAnonyme(browser, width);
        await avec(ouvrir, async (ctx) => {
          const page = await ctx.newPage();
          await page.goto(chemin, { waitUntil: 'domcontentloaded' });
          await attendreChargement(page);
          const res = await new AxeBuilder({ page }).withRules(REGLES_AXE).analyze();
          const ecarts = res.violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
          );
          expect(ecarts, `${nom} a ${width}px`).toEqual([]);
        });
      }
    });
  }

  test('fiche commande: la commande est lisible et tout le paiement est atteignable', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    for (const width of LARGEURS) {
      await avec(contexteConnecte(browser, width), async (ctx) => {
        const page = await ctx.newPage();
        await page.goto(`/sites/${SLUG}/admin/orders/${orderId}`, {
          waitUntil: 'domcontentloaded',
        });
        await page
          .getByText(/Montant d/)
          .first()
          .waitFor({ timeout: 60_000 });
        const m = await mesurerCasse(page);
        expect(m.debordementX, `${width}px`).toBe(0);
        expect(m.libellesCoupes, `${width}px: libelles coupes`).toEqual([]);
        // La colonne de la commande ne doit plus etre ecrasee (70 px constates a 1024).
        const colonne = await page
          .getByText(/Details de commande|Détails de commande/)
          .first()
          .evaluate((el) => el.closest('div.rounded-xl, div[class*="rounded"]')?.clientWidth ?? 0);
        expect(colonne, `${width}px: colonne de la commande trop etroite`).toBeGreaterThan(200);
        for (const nom of [/Offrir la commande/]) {
          const pb = await controleAtteignable(page.getByRole('button', { name: nom }).first());
          expect(pb, `${width}px: ${nom.source}`).toBeNull();
        }
        const carte = page.getByRole('radio', { name: /Carte/ }).first();
        if (await carte.count()) expect(await controleAtteignable(carte), `${width}px`).toBeNull();
      });
    }
  });

  test('photo de plat: la barre Recadrer / Remplacer / Supprimer reste dans sa carte', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    for (const width of [375, 1280]) {
      await avec(contexteConnecte(browser, width), async (ctx) => {
        // L'envoi vers le stockage n'est pas l'objet du test: on renvoie l'image
        // recadree telle que le navigateur l'a produite.
        await ctx.route('**/api/upload', async (route) => {
          const buf = route.request().postDataBuffer() ?? Buffer.alloc(0);
          const s = buf.indexOf(Buffer.from([0xff, 0xd8]));
          const e = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
          const jpg = s >= 0 && e > s ? buf.subarray(s, e + 2) : buf;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ url: `data:image/jpeg;base64,${jpg.toString('base64')}` }),
          });
        });
        const page = await ctx.newPage();
        await page.goto(`/sites/${SLUG}/admin/items`, { waitUntil: 'domcontentloaded' });
        await attendreChargement(page);
        await page.getByRole('button', { name: "Plus d'options" }).first().click();
        await page
          .getByRole('menuitem')
          .filter({ hasText: /Modifier/i })
          .first()
          .click();
        const dlg = page.locator('[role="dialog"]');
        for (let i = 0; i < 2; i++) await dlg.getByRole('button', { name: /^Suivant/ }).click();
        // Deux photos de galerie (cases etroites), puis la photo principale.
        for (let i = 0; i < 2; i++) {
          await dlg.locator('input[type="file"]').last().setInputFiles(PHOTO);
          await dlg
            .getByRole('button', { name: /Appliquer/ })
            .last()
            .click();
          // Attendre la fin de l'envoi: l'editeur de recadrage se referme.
          await expect(dlg.locator('.reactEasyCrop_Container')).toHaveCount(0, { timeout: 30_000 });
        }
        const barres = await dlg.evaluate((d) =>
          [
            ...d.querySelectorAll('button:has(svg.lucide-trash), button:has(svg.lucide-trash-2)'),
          ].map((b) => {
            const carte = b.closest('.rounded-xl') as HTMLElement;
            const rb = b.getBoundingClientRect();
            const rc = carte.getBoundingClientRect();
            return rb.right <= rc.right + 1 && rb.left >= rc.left - 1;
          }),
        );
        expect(barres.length, `${width}px: photos de galerie ajoutees`).toBeGreaterThanOrEqual(2);
        expect(barres, `${width}px: un bouton Supprimer sort de sa carte`).not.toContain(false);
      });
    }
  });
});
