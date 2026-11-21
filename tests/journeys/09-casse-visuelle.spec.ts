/**
 * Parcours 9: aucun ecran casse, ni pour le restaurateur ni pour son client.
 *
 * Garde-fou ne en novembre 2026, apres des casses vues par le proprietaire sur
 * des ecrans pourtant "verts" en CI: barre photo d'un plat coupee ("S"), fiche
 * commande ecrasee a 70 px et paiement inaccessible, "Carte (terminal)" hors
 * du bouton, scanner QR "camera non disponible", libelles de la barre du bas
 * coupes, montants du rapport de stock casses au milieu, etc.
 *
 * Chaque assertion MESURE la page rendue (debordement, texte coupe en largeur
 * ou en hauteur, controle recouvert, defilement parasite) apres chargement des
 * polices. Les echecs sont "doux" (expect.soft): une largeur en echec ne
 * masque pas les autres. Base LOCALE de test.
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
  getAdmin,
  seedTenantWithMenu,
  seedStaffForTenant,
  seedOrderRow,
  teardownTenantBySlug,
} from './fixtures/seed';
import {
  LARGEURS,
  viewport,
  mesurerCasse,
  controleAtteignable,
  attendreContenu,
} from './fixtures/visual';

const SLUG = journeyEnv.tenantSlug;
const ADMIN = `/sites/${SLUG}/admin`;
const PHOTO = path.join(__dirname, '../../public/icons/icon-512.png');

let orderId = '';
let tenantId = '';
let menuItemId = '';
let session: Awaited<ReturnType<Awaited<ReturnType<typeof loginPersona>>['storageState']>>;

/**
 * Outils de developpement (overlay Next, barre de retours agentation): absents
 * en production, ils recouvrent le bas a droite de l'ecran en dev (bouton
 * "Suivant", lien "Analyse" de la barre du bas) et faussent les mesures. Les
 * transitions CSS sont aussi coupees, pour mesurer l'etat final.
 */
async function masquerOutilsDev(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      // Transitions coupees: sinon axe lit les couleurs en plein fondu du theme
      // clair vers le sombre (texte mesure quasi noir sur fond sombre, faux rouge).
      style.textContent =
        'nextjs-portal, [data-agentation-portal], [data-feedback-toolbar] { display: none !important; }' +
        ' *, *::before, *::after { transition: none !important; }';
      document.head.appendChild(style);
    });
  });
}

type Theme = 'light' | 'dark';

async function contexteAnonyme(
  browser: Browser,
  width: number,
  height?: number,
  theme: Theme = 'light',
): Promise<BrowserContext> {
  const vp = viewport(width);
  const ctx = await browser.newContext({
    viewport: { width, height: height ?? vp.height },
    colorScheme: theme,
  });
  await masquerOutilsDev(ctx);
  return ctx;
}

async function contexteConnecte(
  browser: Browser,
  width: number,
  theme: Theme = 'light',
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: viewport(width),
    storageState: session,
    colorScheme: theme,
  });
  await masquerOutilsDev(ctx);
  // Theme de l'admin: preference stockee par l'interrupteur clair/sombre.
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('attabl-admin-theme', t);
    } catch {
      // stockage indisponible: theme par defaut
    }
  }, theme);
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
 * compilation depasse facilement 2 s et l'on mesurerait le squelette. Le
 * tableau de bord interroge le serveur periodiquement: le repos reseau peut ne
 * jamais venir (20 s au plus), mais on attend toujours la fin des squelettes.
 */
async function attendreChargement(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  await attendreContenu(page);
  await page.waitForTimeout(500);
}

/** Mesure generique: ni defilement horizontal ni texte coupe. */
async function verifierCasse(page: Page, contexte: string): Promise<void> {
  const m = await mesurerCasse(page);
  expect.soft(m.debordementX, `${contexte}: la page defile de cote`).toBe(0);
  expect.soft(m.libellesCoupes, `${contexte}: textes coupes`).toEqual([]);
}

test.describe('09 - Aucun ecran casse', () => {
  // workers: 1 (config): beforeAll tourne une fois, et de nouveau si un echec
  // relance le travailleur (le seed repart alors d'une base propre).
  test.beforeAll(async () => {
    test.skip(!hasSeedEnv(), 'JOURNEY_SUPABASE_URL/SERVICE_ROLE_KEY requis (base de TEST).');
    const seeded = await seedTenantWithMenu();
    tenantId = seeded.tenantId;
    menuItemId = seeded.menuItemId;
    await seedStaffForTenant(seeded.tenantId, [OWNER]);
    orderId = await seedOrderRow(seeded.tenantId, { orderNumber: 'JT-CASSE-001' });
    const db = getAdmin();
    // Inventaire et rapport de stock exigent un abonnement qui les inclut, et
    // des ingredients a afficher (noms longs, montants a 5 chiffres).
    const plan = await db
      .from('tenants')
      .update({ subscription_plan: 'business', subscription_status: 'active' })
      .eq('id', seeded.tenantId);
    if (plan.error) throw new Error(`seed abonnement: ${plan.error.message}`);
    const ingr = await db.from('ingredients').insert(
      Array.from({ length: 12 }, (_, i) => ({
        tenant_id: seeded.tenantId,
        name: i % 2 ? `Champagne brut (bouteille 75cl) ${i}` : `Boeuf hache ${i}`,
        unit: i % 2 ? 'bouteille' : 'kg',
        current_stock: 116.34 + i,
        min_stock_alert: 12,
        cost_per_unit: 14000 + i * 1000,
        category: i % 2 ? 'Boissons' : 'Viandes',
      })),
    );
    if (ingr.error) throw new Error(`seed ingredients: ${ingr.error.message}`);
    const api = await loginPersona(OWNER);
    session = await api.storageState();
    await api.dispose();
  });

  test.afterAll(async () => {
    if (hasSeedEnv()) await teardownTenantBySlug();
  });

  const PAGES_ADMIN = [
    '',
    '/items',
    '/categories',
    '/menus',
    '/orders',
    '/users',
    '/settings',
    '/inventory',
    '/recipes',
  ];
  for (const chemin of PAGES_ADMIN) {
    test(`admin${chemin || ' (tableau de bord)'}: ni debordement ni texte coupe`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      for (const width of LARGEURS) {
        await avec(contexteConnecte(browser, width), async (ctx) => {
          const page = await ctx.newPage();
          await page.goto(`${ADMIN}${chemin}`, { waitUntil: 'domcontentloaded' });
          await page.locator('main#main-content').waitFor();
          await attendreChargement(page);
          await verifierCasse(page, `${chemin || '/'} a ${width}px`);
        });
      }
    });
  }

  for (const [nom, chemin] of [
    ['vitrine: accueil', `/sites/${SLUG}`],
    ['vitrine: carte', `/sites/${SLUG}/menu`],
  ] as const) {
    test(`${nom}: ni debordement ni texte coupe`, async ({ browser }) => {
      test.setTimeout(240_000);
      for (const width of LARGEURS) {
        await avec(contexteAnonyme(browser, width), async (ctx) => {
          const page = await ctx.newPage();
          await page.goto(chemin, { waitUntil: 'domcontentloaded' });
          await attendreChargement(page);
          await verifierCasse(page, `${nom} a ${width}px`);
        });
      }
    });
  }

  // Outil de conformite (axe-core, Deque): TOUTES les regles WCAG 2.0, 2.1 et
  // 2.2 de niveau A et AA (contrastes, noms accessibles, ARIA, zones tactiles).
  // Ecarts ramenes a zero le 2026-11-18 sur ces pages, en clair et en sombre.
  const NORMES_AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  for (const [nom, chemin, connecte] of [
    ['connexion', '/login', false],
    ['inscription', '/signup', false],
    ['tableau de bord', ADMIN, true],
    ['commandes', `${ADMIN}/orders`, true],
    ['plats', `${ADMIN}/items`, true],
    ['vitrine: accueil', `/sites/${SLUG}`, false],
    ['vitrine: carte', `/sites/${SLUG}/menu`, false],
  ] as const) {
    test(`axe-core WCAG A/AA: ${nom}`, async ({ browser }) => {
      test.setTimeout(240_000);
      for (const theme of ['light', 'dark'] as const)
        for (const width of [375, 1280]) {
          const ouvrir = connecte
            ? contexteConnecte(browser, width, theme)
            : contexteAnonyme(browser, width, undefined, theme);
          await avec(ouvrir, async (ctx) => {
            const page = await ctx.newPage();
            await page.goto(chemin, { waitUntil: 'domcontentloaded' });
            await attendreChargement(page);
            const res = await new AxeBuilder({ page }).withTags(NORMES_AXE).analyze();
            const ecarts = res.violations.map(
              (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
            );
            expect.soft(ecarts, `${nom} a ${width}px (${theme})`).toEqual([]);
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
        await page.goto(`${ADMIN}/orders/${orderId}`, { waitUntil: 'domcontentloaded' });
        await page
          .getByText(/Montant d/)
          .first()
          .waitFor({ timeout: 60_000 });
        await verifierCasse(page, `fiche commande a ${width}px`);
        // La colonne de la commande ne doit plus etre ecrasee (70 px constates a 1024).
        const colonne = await page.getByTestId('order-items-card').evaluate((el) => el.clientWidth);
        expect.soft(colonne, `${width}px: colonne de la commande`).toBeGreaterThan(200);
        const offrir = page.getByRole('button', { name: /Offrir la commande/ }).first();
        expect.soft(await controleAtteignable(offrir), `${width}px: Offrir`).toBeNull();
        // Le selecteur Especes / Carte DOIT etre la (moyens par defaut: les deux).
        const carte = page.getByRole('radio', { name: /Carte/ }).first();
        await expect.soft(carte, `${width}px: choix Carte present`).toHaveCount(1);
        if ((await carte.count()) > 0) {
          expect.soft(await controleAtteignable(carte), `${width}px: Carte`).toBeNull();
        }
      });
    }
  });

  test('inventaire sur tablette: des cartes et aucun tableau (jusqu a 1280)', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    for (const width of [768, 1024]) {
      await avec(contexteConnecte(browser, width), async (ctx) => {
        const page = await ctx.newPage();
        await page.goto(`${ADMIN}/inventory`, { waitUntil: 'domcontentloaded' });
        await page
          .getByText(/Champagne brut/)
          .first()
          .waitFor({ timeout: 60_000 });
        await attendreChargement(page);
        // Sous 1280 px: des cartes, et aucun tableau (zero tableau coupe ne
        // prouverait rien si aucun tableau ni aucune carte ne s'affichait).
        const vue = await page.evaluate(() => ({
          cartes:
            document.querySelector('main [data-testid="responsive-cards"]')?.children.length ?? 0,
          tableaux: document.querySelectorAll('main table').length,
        }));
        expect.soft(vue.cartes, `${width}px: cartes de l'inventaire`).toBeGreaterThan(0);
        expect.soft(vue.tableaux, `${width}px: tableau au lieu des cartes`).toBe(0);
        await verifierCasse(page, `inventaire a ${width}px`);
      });
    }
  });

  test('rapport de stock: aucun montant casse sur plusieurs lignes', async ({ browser }) => {
    test.setTimeout(180_000);
    for (const width of [375, 768, 1280]) {
      await avec(contexteConnecte(browser, width), async (ctx) => {
        const page = await ctx.newPage();
        await page.goto(`${ADMIN}/inventory/reports`, { waitUntil: 'domcontentloaded' });
        await page.locator('#report-sheet td').first().waitFor({ timeout: 60_000 });
        await attendreChargement(page);
        const casses = await page.evaluate(() =>
          [...document.querySelectorAll('#report-sheet td.text-right')]
            .filter((td) => {
              const range = document.createRange();
              range.selectNodeContents(td);
              const lignes = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
              return lignes.size > 1;
            })
            .map((td) => (td.textContent ?? '').trim()),
        );
        expect.soft(casses, `${width}px: montants sur 2 lignes ou plus`).toEqual([]);
      });
    }
  });

  test('cuisine sur telephone: les filtres de la barre du bas restent lisibles', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    await avec(contexteConnecte(browser, 375), async (ctx) => {
      const page = await ctx.newPage();
      await page.goto(`${ADMIN}/kitchen`, { waitUntil: 'domcontentloaded' });
      // Ecran d'accueil de la cuisine: un geste est requis pour activer le son.
      await page
        .getByText(/activer le son/i)
        .first()
        .click({ timeout: 30_000 });
      await page.locator('footer [role="tab"]').first().waitFor({ timeout: 60_000 });
      await attendreChargement(page);
      const recouverts = await page.evaluate(() => {
        const nav = document.querySelector('footer nav') as HTMLElement;
        const n = nav.getBoundingClientRect();
        return [...nav.querySelectorAll('[role="tab"]')]
          .filter((t) => {
            const r = t.getBoundingClientRect();
            if (r.left >= n.right) return false; // hors bande: atteint en faisant defiler
            const x = Math.min(r.left + r.width / 2, n.right - 4);
            const dessus = document.elementFromPoint(x, r.top + r.height / 2);
            return !!dessus && !t.contains(dessus) && !nav.contains(dessus);
          })
          .map((t) => (t.textContent ?? '').trim());
      });
      expect.soft(recouverts, 'filtres recouverts').toEqual([]);
      await verifierCasse(page, 'cuisine a 375px');
    });
  });

  test('panier: le bouton de commande et le total restent entiers', async ({ browser }) => {
    test.setTimeout(180_000);
    for (const width of [375, 1280]) {
      await avec(contexteAnonyme(browser, width), async (ctx) => {
        const page = await ctx.newPage();
        // Panier pre-rempli comme le fait CartContext (cle attabl_<slug>_cart):
        // le test porte sur l'affichage du panier, pas sur le parcours d'ajout.
        await ctx.addInitScript(
          ({ slug, item, resto }) => {
            localStorage.setItem(`attabl_${slug}_cart`, JSON.stringify([item]));
            localStorage.setItem(`attabl_${slug}_cart_restaurant_id`, resto);
          },
          {
            slug: SLUG,
            item: { id: menuItemId, name: 'Poulet braise', price: 2500, quantity: 2 },
            resto: tenantId,
          },
        );
        await page.goto(`/sites/${SLUG}/cart`, { waitUntil: 'domcontentloaded' });
        const cta = page.getByRole('button', { name: /Confirmer/ }).first();
        await cta.waitFor({ timeout: 60_000 });
        await attendreChargement(page);
        await verifierCasse(page, `panier a ${width}px`);
      });
    }
  });

  test('scanner QR: un refus de camera dit ou l autoriser, sans texte coupe', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    await avec(contexteAnonyme(browser, 390, 844), async (ctx) => {
      await ctx.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = () =>
          Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      });
      const page = await ctx.newPage();
      await page.goto(`/sites/${SLUG}`, { waitUntil: 'domcontentloaded' });
      await attendreChargement(page);
      // L'accueil rend deux en-tetes (telephone et grand ecran): seul le bouton
      // visible compte. Clic repete tant que la page n'est pas hydratee.
      const refus = page.getByText(/Accès à la caméra refusé/);
      await expect(async () => {
        await page
          .getByRole('button', { name: /Scanner le QR/i })
          .filter({ visible: true })
          .first()
          .click();
        await expect(refus).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      await expect.soft(page.getByText(/Réglages > Safari/)).toBeVisible();
      await verifierCasse(page, 'scanner refuse a 390px');
    });
  });

  test('connexion et inscription: aucun defilement de 660 a 810 px de haut (regle 12)', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    for (const chemin of ['/login', '/signup']) {
      for (const width of [1024, 1194]) {
        for (const height of [660, 700, 744, 810]) {
          await avec(contexteAnonyme(browser, width, height), async (ctx) => {
            const page = await ctx.newPage();
            await page.goto(chemin, { waitUntil: 'domcontentloaded' });
            await attendreChargement(page);
            const defilement = await page.evaluate(async () => {
              await document.fonts.ready;
              const racine = document.scrollingElement;
              const zones = [...document.querySelectorAll('*')].filter((e) =>
                /(auto|scroll)/.test(getComputedStyle(e).overflowY),
              );
              const els = racine ? [racine, ...zones] : zones;
              return Math.max(0, ...els.map((e) => e.scrollHeight - e.clientHeight));
            });
            expect.soft(defilement, `${chemin} a ${width}x${height}`).toBeLessThanOrEqual(1);
          });
        }
      }
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
        await page.goto(`${ADMIN}/items`, { waitUntil: 'domcontentloaded' });
        await attendreChargement(page);
        await page.getByRole('button', { name: "Plus d'options" }).first().click();
        await page
          .getByRole('menuitem')
          .filter({ hasText: /Modifier/i })
          .first()
          .click();
        const dlg = page.locator('[role="dialog"]');
        for (let i = 0; i < 2; i++) await dlg.getByRole('button', { name: /^Suivant/ }).click();
        // Deux photos de galerie (cases etroites).
        for (let i = 0; i < 2; i++) {
          await dlg.locator('input[type="file"]').last().setInputFiles(PHOTO);
          await dlg
            .getByRole('button', { name: /Appliquer/ })
            .last()
            .click();
          // Attendre la fin de l'envoi: l'editeur de recadrage se referme.
          await expect(dlg.locator('.reactEasyCrop_Container')).toHaveCount(0, {
            timeout: 30_000,
          });
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
        expect.soft(barres.length, `${width}px: photos de galerie`).toBeGreaterThanOrEqual(2);
        expect
          .soft(barres, `${width}px: un bouton Supprimer sort de sa carte`)
          .not.toContain(false);
      });
    }
  });
});
