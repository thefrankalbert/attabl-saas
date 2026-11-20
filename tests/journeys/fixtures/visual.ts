/**
 * Mesures de casse visuelle, prises sur la page RENDUE (jamais deduites des
 * classes CSS, cf .claude/rules/11 section 0). Utilisees par 09-casse-visuelle.
 */
import type { Page, Locator } from '@playwright/test';

export const LARGEURS = [375, 768, 1024, 1280, 1440] as const;
const HAUTEUR: Record<number, number> = { 375: 812, 768: 1024, 1024: 768, 1280: 800, 1440: 900 };

export function viewport(width: number): { width: number; height: number } {
  return { width, height: HAUTEUR[width] ?? 900 };
}

export interface MesureCasse {
  /** Pixels de defilement horizontal de la page (doit valoir 0). */
  debordementX: number;
  /** Textes coupes (largeur ou hauteur) ou qui sortent de leur boite. */
  libellesCoupes: string[];
}

/**
 * Attribut a poser sur un texte dont la troncature est un CHOIX (nom long dans
 * une barre etroite, avec infobulle). Seuls ces cas sont toleres: un `title`
 * seul ne suffit plus, sinon toute coupe munie d'une infobulle passerait.
 */
export const TRONCATURE_VOULUE = 'data-troncature-voulue';

/**
 * - debordement horizontal de la page (le conteneur qui defile ou le document);
 * - texte visible d'un controle, d'un titre ou d'une cellule qui sort de sa
 *   boite, ou qui est coupe en largeur (ellipsis) ou en hauteur (line-clamp,
 *   hauteur fixe), sauf troncature voulue marquee `data-troncature-voulue`.
 * Mesure apres chargement des polices: sinon le resultat depend du moment ou
 * la police arrive (une police de repli plus etroite masque une coupe).
 * Les outils de dev (overlay Next, barre agentation) sont ignores.
 */
async function mesurerUneFois(page: Page): Promise<MesureCasse> {
  return page.evaluate(async (voulue) => {
    await document.fonts.ready;
    const ignore = (el: Element) =>
      !!el.closest('nextjs-portal, [data-agentation-portal], [data-feedback-toolbar]');
    const sc = document.getElementById('main-content') ?? document.scrollingElement;
    const debordementX = Math.max(
      sc ? Math.round(sc.scrollWidth - sc.clientWidth) : 0,
      Math.round(document.documentElement.scrollWidth - window.innerWidth),
    );
    const libellesCoupes: string[] = [];
    const cibles = document.querySelectorAll(
      'button, a, [role="tab"], [role="radio"], h1, h2, h3, th, td',
    );
    for (const el of cibles) {
      if (ignore(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      // Texte visible seulement (le texte sr-only est hors ecran par conception).
      const feuilles = [...el.querySelectorAll('*'), el].filter(
        (x) =>
          !x.closest('.sr-only') &&
          // Libelle masque expres (ex: `hidden sm:inline` sur telephone): pas affiche.
          x.getClientRects().length > 0 &&
          [...x.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim()),
      );
      for (const f of feuilles) {
        if (f.closest(`[${voulue}]`)) continue;
        const range = document.createRange();
        range.selectNodeContents(f);
        const t = range.getBoundingClientRect();
        const fs = getComputedStyle(f);
        const sort = t.left < r.left - 2 || t.right > r.right + 2;
        const coupeLargeur =
          f instanceof HTMLElement &&
          f.scrollWidth > f.clientWidth + 1 &&
          fs.overflowX !== 'visible';
        const clamp = fs.getPropertyValue('-webkit-line-clamp');
        const coupeHauteur =
          f instanceof HTMLElement &&
          f.scrollHeight > f.clientHeight + 1 &&
          (fs.overflowY !== 'visible' || (clamp !== '' && clamp !== 'none'));
        if (sort || coupeLargeur || coupeHauteur) {
          const libelle = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
          libellesCoupes.push(`"${libelle}" (${Math.round(r.width)}px)`);
          break;
        }
      }
    }
    return { debordementX, libellesCoupes: [...new Set(libellesCoupes)] };
  }, TRONCATURE_VOULUE);
}

/**
 * Attendre le CONTENU: plus aucun squelette de chargement (bloc `animate-pulse`
 * sans texte, plus haut qu'une pastille). Echec explicite apres 30 s plutot que
 * mesurer un squelette, qui a peu de texte et donnerait un faux vert.
 */
export async function attendreContenu(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('.animate-pulse')].some(
        (e) => e.getBoundingClientRect().height > 24 && !(e.textContent ?? '').trim(),
      ),
    null,
    { timeout: 30_000 },
  );
}

/**
 * Sous `next dev` (CI Journeys), Next 16 recharge parfois la page pendant la
 * mesure ("Execution context was destroyed"): on remesure apres chargement.
 */
export async function mesurerCasse(page: Page): Promise<MesureCasse> {
  for (let essai = 1; ; essai++) {
    try {
      return await mesurerUneFois(page);
    } catch (err) {
      const rechargement =
        err instanceof Error && /context was destroyed|navigation/i.test(err.message);
      if (!rechargement || essai >= 3) throw err;
      await page.waitForLoadState('load');
      await attendreContenu(page);
    }
  }
}

/**
 * Le controle est-il vraiment utilisable ? Amene a l'ecran comme le ferait
 * l'utilisateur (defilement), puis verifie que rien ne le recouvre (barre du
 * bas, panneau voisin) et que son libelle tient dans sa boite.
 */
export async function controleAtteignable(cible: Locator): Promise<string | null> {
  // Centre le controle, comme l'utilisateur qui fait defiler jusqu'a lui (un
  // defilement "au plus pres" le colle au bord, sous la barre du bas fixe).
  await cible.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await cible.page().waitForTimeout(300);
  return cible.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight + 1 || r.top < 0) return 'hors de l ecran apres defilement';
    const x = r.left + r.width / 2;
    const y = r.top + Math.min(r.height / 2, 8);
    const dessus = document.elementFromPoint(x, y);
    if (dessus && !el.contains(dessus) && !dessus.contains(el)) {
      return `recouvert par <${dessus.tagName.toLowerCase()}>`;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    if (t.right > r.right + 2 || t.left < r.left - 2) return 'libelle qui sort du bouton';
    return null;
  });
}
