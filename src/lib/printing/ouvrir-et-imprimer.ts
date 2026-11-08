import { logger } from '@/lib/logger';

/**
 * Ouvre un document imprimable et ne lance l'impression qu'une fois la police
 * chargee.
 *
 * DEUX DEFAUTS QUE CETTE FONCTION FERME, et les trois documents les partageaient
 * mot pour mot.
 *
 * 1. LA COURSE AU CHARGEMENT. Le code ecrivait le document avec
 *    `document.write(...)` puis `document.close()`, et assignait SEULEMENT
 *    APRES `printWindow.onload = ...`. Or `close()` peut declencher l'evenement
 *    `load` immediatement: le gestionnaire est alors pose trop tard et
 *    `print()` n'est jamais appele. L'utilisateur voit une fenetre s'ouvrir et
 *    ne rien faire, et doit lancer l'impression a la main.
 * 2. L'IMPRESSION AVANT LA POLICE. Meme quand `onload` partait, il part des que
 *    le document est pret - pas quand la police l'est. Le navigateur imprimait
 *    donc ce qu'il avait sous la main: la police de remplacement.
 *
 * On attend donc `document.fonts.ready`, avec un garde-fou: si la police n'est
 * pas la au bout du delai, on imprime quand meme. Un document qui sort dans une
 * police approximative vaut mieux qu'un document qui ne sort pas - un service en
 * salle n'attend pas.
 */

/** Au-dela, on imprime sans attendre davantage. */
const DELAI_POLICE_MS = 2500;

interface FenetreImprimable extends Window {
  document: Document & { fonts?: FontFaceSet };
}

function lancerUneSeuleFois(fenetre: Window): () => void {
  let deja = false;
  return () => {
    if (deja || fenetre.closed) return;
    deja = true;
    fenetre.focus();
    fenetre.print();
  };
}

/**
 * @param html Document complet, deja rendu par `renderDocumentShell`.
 * @param options `width`/`height` de la fenetre (format thermique ou A4).
 * @returns true si la fenetre a pu etre ouverte, false si le navigateur l'a bloquee.
 */
export function ouvrirEtImprimer(
  html: string,
  { width, height }: { width: number; height: number },
): boolean {
  const fenetre = window.open(
    '',
    '_blank',
    `width=${width},height=${height}`,
  ) as FenetreImprimable | null;
  if (!fenetre) {
    logger.warn('Impression impossible: la fenetre a ete bloquee par le navigateur');
    return false;
  }

  fenetre.document.write(html);
  fenetre.document.close();

  const imprimer = lancerUneSeuleFois(fenetre);

  const attendrePolicePuisImprimer = () => {
    // Garde-fou AVANT l'attente: si `fonts.ready` ne se resout jamais (police
    // absente, reseau coupe), le document doit quand meme sortir.
    const secours = fenetre.setTimeout(imprimer, DELAI_POLICE_MS);
    const police = fenetre.document.fonts;
    if (!police) {
      fenetre.clearTimeout(secours);
      imprimer();
      return;
    }
    police.ready
      .then(() => {
        fenetre.clearTimeout(secours);
        imprimer();
      })
      .catch(() => {
        fenetre.clearTimeout(secours);
        imprimer();
      });
  };

  // `close()` peut avoir deja declenche `load`: on teste l'etat AVANT de poser
  // un ecouteur, sinon on attend un evenement deja passe.
  if (fenetre.document.readyState === 'complete') {
    attendrePolicePuisImprimer();
  } else {
    fenetre.addEventListener('load', attendrePolicePuisImprimer, { once: true });
  }

  return true;
}
