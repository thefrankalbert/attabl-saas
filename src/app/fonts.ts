/**
 * Polices auto-hebergees.
 *
 * POURQUOI (incident du 2026-08-11) : ces 15 familles etaient chargees via
 * `next/font/google`, qui telecharge les fichiers depuis fonts.gstatic.com
 * PENDANT LE BUILD. Google a fait tourner ses fichiers Roboto et a servi une
 * feuille de style pointant vers des .woff2 pas encore en ligne : 27 erreurs
 * `Module not found`, build avorte, production bloquee. Rien dans le message
 * d'erreur ne disait que la panne venait de chez Google.
 *
 * Un build ne doit dependre d'aucun service tiers. Les fichiers vivent
 * desormais dans `src/app/fonts/` et sont versionnes : le build est reproductible
 * hors ligne, et une panne de Google ne peut plus empecher de livrer un
 * correctif urgent.
 *
 * Effet de bord bienvenu : plus aucune requete vers Google au chargement des
 * pages. Le marche d'ATTABL est l'Afrique de l'Ouest, ou chaque aller-retour
 * vers un domaine tiers coute cher en latence.
 *
 * POUR CHANGER LA LISTE : mettre a jour `scripts/telecharger-polices.mjs`, le
 * relancer, puis refleter le resultat ici. Ne pas editer les .woff2 a la main.
 *
 * Les noms de variables CSS sont IDENTIQUES a ceux d'avant : tout le reste du
 * code (globals.css, `font-[family-name:var(--font-sora)]`, les themes tenant
 * de `src/lib/config/fonts.ts`) continue de fonctionner sans changement.
 */
import localFont from 'next/font/local';

/**
 * Les graisses des polices variables reprennent EXACTEMENT la plage servie par
 * Google pour chaque famille. Une plage plus large que la realite ferait
 * synthetiser au navigateur des graisses qui n'existent pas dans le fichier -
 * du gras approximatif au lieu du vrai gras dessine.
 */

export const geistSans = localFont({
  src: './fonts/geist-variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
});

export const geistMono = localFont({
  src: './fonts/geist-mono-variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
});

export const dmSerifDisplay = localFont({
  src: './fonts/dm-serif-display-400.woff2',
  variable: '--font-dm-serif-display',
  weight: '400',
  display: 'swap',
  // Police a empattements : la police de secours doit l'etre aussi, sinon le
  // texte saute d'une forme a l'autre au moment ou la vraie police arrive.
  adjustFontFallback: 'Times New Roman',
});

export const instrumentSerif = localFont({
  src: './fonts/instrument-serif-400.woff2',
  variable: '--font-instrument-serif',
  weight: '400',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

// ===== Polices proposees aux restaurants (voir src/lib/config/fonts.ts) =====
// Toutes sont declarees ici pour que la page d'un restaurant puisse basculer de
// l'une a l'autre par simple variable CSS, sans requete supplementaire.

export const inter = localFont({
  src: './fonts/inter-variable.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});

export const poppins = localFont({
  src: [
    { path: './fonts/poppins-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/poppins-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/poppins-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/poppins-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-poppins',
  display: 'swap',
});

export const montserrat = localFont({
  src: './fonts/montserrat-variable.woff2',
  variable: '--font-montserrat',
  weight: '100 900',
  display: 'swap',
});

export const playfairDisplay = localFont({
  src: './fonts/playfair-display-variable.woff2',
  variable: '--font-playfair-display',
  weight: '400 900',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

export const raleway = localFont({
  src: './fonts/raleway-variable.woff2',
  variable: '--font-raleway',
  weight: '100 900',
  display: 'swap',
});

export const nunito = localFont({
  src: './fonts/nunito-variable.woff2',
  variable: '--font-nunito',
  weight: '200 1000',
  display: 'swap',
});

export const roboto = localFont({
  src: './fonts/roboto-variable.woff2',
  variable: '--font-roboto',
  weight: '100 900',
  display: 'swap',
});

export const lato = localFont({
  src: [
    { path: './fonts/lato-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/lato-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-lato',
  display: 'swap',
});

export const openSans = localFont({
  src: './fonts/open-sans-variable.woff2',
  variable: '--font-open-sans',
  weight: '300 800',
  display: 'swap',
});

export const sourceSans3 = localFont({
  src: './fonts/source-sans-3-variable.woff2',
  variable: '--font-source-sans-3',
  weight: '200 900',
  display: 'swap',
});

// Sora est la police d'affichage des pages marketing, des articles de blog et
// des sections nouveautes/features, via `font-[family-name:var(--font-sora)]`.
export const sora = localFont({
  src: './fonts/sora-variable.woff2',
  variable: '--font-sora',
  weight: '100 800',
  display: 'swap',
});
