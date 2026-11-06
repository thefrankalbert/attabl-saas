import { test, expect, type Page } from '@playwright/test';

/**
 * Garde responsive des pages vues par un CONVIVE (publiques, sans connexion).
 *
 * CE QUI A CHANGE ET POURQUOI (audit du 2026-11-06). Trois defauts rendaient
 * cette garde peu fiable:
 *
 *  1. Le detecteur comptait TOUT element dont le bord droit depasse le
 *     viewport, y compris ceux places dans un conteneur qui defile
 *     horizontalement EXPRES (la rangee de pastilles de categories). Il
 *     signalait donc des debordements qui n'en sont pas. Mesure a l'appui: la
 *     page cliente ne deborde a AUCUNE des huit tailles testees ici, alors que
 *     l'ancien detecteur y voyait des fautes.
 *  2. Le vrai symptome - "la page defile de cote" - ne se lit pas element par
 *     element mais sur la largeur de defilement de la page. C'est desormais
 *     l'assertion principale.
 *  3. Le slug du restaurant etait ecrit en dur. Il est pris dans
 *     E2E_TENANT_SLUG pour que la garde suive la base de test utilisee.
 *
 * La zone tactile est verifiee ici aussi: la regle du depot
 * (.claude/rules/03) demande 44px au doigt, et l'audit a trouve le bouton
 * "ajouter au panier" a 34px - le geste principal du produit.
 */

const SLUG = process.env.E2E_TENANT_SLUG ?? 'demo';

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablette-portrait-768', width: 768, height: 1024 },
  { name: 'tablette-paysage-1024', width: 1024, height: 768 },
  { name: 'tablette-paysage-courte-1024x600', width: 1024, height: 600 },
  { name: 'ordinateur-1280', width: 1280, height: 800 },
  { name: 'ordinateur-1440', width: 1440, height: 900 },
  { name: 'grand-ecran-1920', width: 1920, height: 1080 },
] as const;

const PAGES = [
  { nom: 'accueil', chemin: `/sites/${SLUG}` },
  { nom: 'carte', chemin: `/sites/${SLUG}/menu` },
  { nom: 'panier', chemin: `/sites/${SLUG}/cart` },
] as const;

/** La page defile-t-elle de cote ? C'est le symptome que voit le convive. */
async function mesurerDebordementHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroller = document.getElementById('main-content') ?? document.scrollingElement;
    if (!scroller) return 0;
    return Math.max(
      Math.round(scroller.scrollWidth - scroller.clientWidth),
      Math.round(document.body.scrollWidth - window.innerWidth),
    );
  });
}

/**
 * Elements qui depassent leur conteneur SANS qu'un ancetre ne defile
 * horizontalement. Un element dans une rangee qui defile expres n'est pas une
 * faute; un titre coupe par un conteneur fixe en est une.
 */
async function listerElementsCoupes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scroller = document.getElementById('main-content') ?? document.body;
    const ancetreDefile = (el: Element): boolean => {
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowX)) return true;
        parent = parent.parentElement;
      }
      return false;
    };
    const limite = scroller.getBoundingClientRect().left + scroller.clientWidth;
    return [...scroller.querySelectorAll('button, a, input, img, h1, h2, h3, p, span')]
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ el, rect }) => rect.width > 0 && rect.right > limite + 1 && !ancetreDefile(el))
      .slice(0, 5)
      .map(
        ({ el, rect }) =>
          `${el.tagName.toLowerCase()}[${(el.textContent ?? '').trim().slice(0, 24)}] +${Math.round(
            rect.right - limite,
          )}px`,
      );
  });
}

for (const vp of VIEWPORTS) {
  for (const p of PAGES) {
    test(`${p.nom} ne deborde pas en ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(p.chemin, { waitUntil: 'networkidle' });
      await expect(page.locator('body')).toBeVisible();

      const debordement = await mesurerDebordementHorizontal(page);
      expect(debordement, `La page defile de cote de ${debordement}px`).toBe(0);

      const coupes = await listerElementsCoupes(page);
      expect(coupes, `Elements coupes: ${coupes.join(' / ')}`).toEqual([]);
    });
  }
}

test('les zones tactiles de la carte font au moins 44px au doigt', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/sites/${SLUG}/menu`, { waitUntil: 'networkidle' });

  const tropPetits = await page.evaluate(() => {
    // La zone sensible peut etre elargie par un pseudo-element transparent
    // (cercle "+" de la carte, pastilles de categories): on mesure la zone
    // REELLE, pas seulement la boite visible.
    const zoneReelle = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const avant = getComputedStyle(el, '::before');
      const haut = parseFloat(avant.insetBlockStart || '0');
      const gauche = parseFloat(avant.insetInlineStart || '0');
      const marge = (v: number) => (Number.isNaN(v) ? 0 : Math.abs(Math.min(v, 0)) * 2);
      return { largeur: rect.width + marge(gauche), hauteur: rect.height + marge(haut) };
    };
    return [...document.querySelectorAll('button, a[href]')]
      .map((el) => ({ el, z: zoneReelle(el) }))
      .filter(({ z }) => z.largeur > 0 && (z.hauteur < 44 || z.largeur < 44))
      .map(
        ({ el, z }) =>
          `${el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 16)} ${Math.round(
            z.largeur,
          )}x${Math.round(z.hauteur)}`,
      );
  });

  expect(tropPetits, `Zones tactiles sous 44px: ${tropPetits.join(' / ')}`).toEqual([]);
});
