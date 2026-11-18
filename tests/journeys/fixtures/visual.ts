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
  /** Boutons / liens dont le libelle sort de la boite (texte coupe ou qui deborde). */
  libellesCoupes: string[];
}

/**
 * - debordement horizontal de la page (le conteneur qui defile ou le document);
 * - controle dont le texte visible depasse sa propre boite, ou qui est coupe sans
 *   ellipsis volontaire. Un libelle en ellipsis avec `title` est un choix, pas une casse.
 * Les outils de dev (overlay Next, barre agentation) sont ignores.
 */
export async function mesurerCasse(page: Page): Promise<MesureCasse> {
  return page.evaluate(() => {
    const ignore = (el: Element) =>
      !!el.closest('nextjs-portal, [data-agentation-portal], [data-feedback-toolbar]');
    const sc = document.getElementById('main-content') ?? document.scrollingElement;
    const debordementX = Math.max(
      sc ? Math.round(sc.scrollWidth - sc.clientWidth) : 0,
      Math.round(document.documentElement.scrollWidth - window.innerWidth),
    );
    const libellesCoupes: string[] = [];
    const controles = document.querySelectorAll('button, a, [role="tab"], [role="radio"]');
    for (const el of controles) {
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
        const range = document.createRange();
        range.selectNodeContents(f);
        const t = range.getBoundingClientRect();
        const fs = getComputedStyle(f);
        const ellipsisVolontaire = fs.textOverflow === 'ellipsis' && (el as HTMLElement).title;
        const sort = t.left < r.left - 2 || t.right > r.right + 2;
        const coupe =
          f instanceof HTMLElement &&
          f.scrollWidth > f.clientWidth + 1 &&
          fs.overflowX !== 'visible' &&
          !ellipsisVolontaire;
        if (sort || coupe) {
          const libelle = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
          libellesCoupes.push(`"${libelle}" (${Math.round(r.width)}px)`);
          break;
        }
      }
    }
    return { debordementX, libellesCoupes: [...new Set(libellesCoupes)] };
  });
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
