/**
 * Telecharge une fois pour toutes les polices Google utilisees par ATTABL, pour
 * que le build n'ait plus JAMAIS besoin de joindre fonts.gstatic.com.
 *
 * Ne tourne pas au build: on le lance a la main quand on change la liste des
 * polices, et on versionne le resultat.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SORTIE = process.argv[2] ?? 'src/app/fonts';

// UA d'un navigateur moderne: sans lui Google sert du TTF au lieu du woff2.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Miroir exact de la configuration de `src/app/layout.tsx`. `axe` decrit les
 * polices variables: Google les sert en un seul fichier couvrant toute la plage
 * de graisses, il ne faut donc PAS demander les graisses une par une.
 */
const FAMILLES = [
  { google: 'Geist', slug: 'geist', axe: '100..900' },
  { google: 'Geist Mono', slug: 'geist-mono', axe: '100..900' },
  { google: 'DM Serif Display', slug: 'dm-serif-display', poids: [400] },
  { google: 'Instrument Serif', slug: 'instrument-serif', poids: [400] },
  { google: 'Inter', slug: 'inter', axe: '100..900' },
  { google: 'Poppins', slug: 'poppins', poids: [400, 500, 600, 700] },
  { google: 'Montserrat', slug: 'montserrat', axe: '100..900' },
  { google: 'Playfair Display', slug: 'playfair-display', axe: '400..900' },
  { google: 'Raleway', slug: 'raleway', axe: '100..900' },
  { google: 'Nunito', slug: 'nunito', axe: '200..1000' },
  { google: 'Roboto', slug: 'roboto', axe: '100..900' },
  { google: 'Lato', slug: 'lato', poids: [400, 700] },
  { google: 'Open Sans', slug: 'open-sans', axe: '300..800' },
  { google: 'Source Sans 3', slug: 'source-sans-3', axe: '200..900' },
  { google: 'Sora', slug: 'sora', axe: '100..800' },
];

function urlCss(f) {
  const nom = f.google.replace(/ /g, '+');
  const spec = f.axe ? `wght@${f.axe}` : `wght@${f.poids.join(';')}`;
  return `https://fonts.googleapis.com/css2?family=${nom}:${spec}&display=swap`;
}

/**
 * Google renvoie un bloc @font-face par sous-ensemble Unicode, precede d'un
 * commentaire qui le nomme. ATTABL declare `subsets: ['latin']`, on ne garde
 * donc que celui-la: prendre tout multiplierait le poids sans rien afficher de
 * plus (cyrillique, grec, vietnamien...).
 */
function extraireLatin(css) {
  const blocs = css.split('/*').slice(1);
  const resultat = [];
  for (const bloc of blocs) {
    const nom = bloc.slice(0, bloc.indexOf('*/')).trim();
    if (nom !== 'latin') continue;
    const url = bloc.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)?.[1];
    const poids = bloc.match(/font-weight:\s*([^;]+);/)?.[1]?.trim();
    const style = bloc.match(/font-style:\s*([^;]+);/)?.[1]?.trim() ?? 'normal';
    if (url) resultat.push({ url, poids, style });
  }
  return resultat;
}

async function recuperer(url, options = {}) {
  for (let essai = 1; essai <= 4; essai++) {
    const rep = await fetch(url, { headers: { 'User-Agent': UA }, ...options });
    if (rep.ok) return rep;
    if (essai === 4) throw new Error(`${rep.status} sur ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * essai));
  }
}

await mkdir(SORTIE, { recursive: true });
const manifeste = [];

for (const f of FAMILLES) {
  const css = await (await recuperer(urlCss(f))).text();
  const faces = extraireLatin(css);
  if (faces.length === 0) throw new Error(`aucun bloc latin pour ${f.google}`);

  const fichiers = [];
  for (const face of faces) {
    // Une police variable rend UN fichier; une statique en rend un par graisse.
    const suffixe = f.axe ? 'variable' : face.poids;
    const nomFichier = `${f.slug}-${suffixe}.woff2`;
    const octets = Buffer.from(await (await recuperer(face.url)).arrayBuffer());
    await writeFile(path.join(SORTIE, nomFichier), octets);
    fichiers.push({
      fichier: nomFichier,
      poids: face.poids,
      style: face.style,
      taille: octets.length,
    });
  }
  manifeste.push({ ...f, fichiers });
  const ko = Math.round(fichiers.reduce((s, x) => s + x.taille, 0) / 1024);
  console.log(`${f.slug.padEnd(20)} ${String(fichiers.length).padStart(2)} fichier(s)  ${ko} Ko`);
}

await writeFile(path.join(SORTIE, 'manifeste.json'), JSON.stringify(manifeste, null, 2));
const total = manifeste.flatMap((m) => m.fichiers).reduce((s, x) => s + x.taille, 0);
console.log(
  `\nTOTAL: ${manifeste.flatMap((m) => m.fichiers).length} fichiers, ${Math.round(total / 1024)} Ko`,
);
