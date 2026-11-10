// --- Excel Template Generation --------------------------------

import { buildStyledWorkbook, type StyledColumn } from '@/lib/exports/styled-workbook';

// En-tetes francais: ce sont ceux que lit le restaurateur. Le parser accepte
// aussi les anciens en-tetes anglais (voir COLUMN_ALIASES), donc les fichiers
// telecharges avant ce changement restent importables.
const COLUMNS: StyledColumn[] = [
  { header: 'Catégorie', width: 20 },
  { header: 'Catégorie EN', width: 20 },
  { header: 'Nom du plat', width: 28 },
  { header: 'Nom du plat EN', width: 28 },
  { header: 'Description', width: 42 },
  { header: 'Description EN', width: 42 },
  { header: 'Prix', width: 10, numeric: true },
  { header: 'Disponible', width: 12 },
  { header: 'En vedette', width: 12 },
];

const EXAMPLE_ROWS = [
  [
    'Entrées',
    'Starters',
    'Salade avocat crevettes',
    'Avocado and shrimp salad',
    'Avocat, crevettes sautées, citron vert',
    'Avocado, sauteed shrimp, lime',
    3500,
    'Oui',
    'Non',
  ],
  [
    'Entrées',
    'Starters',
    'Alloco sauce piment',
    'Fried plantain, chili sauce',
    'Banane plantain frite, sauce maison',
    'Fried plantain, house sauce',
    2000,
    'Oui',
    'Non',
  ],
  [
    'Plats',
    'Main courses',
    'Poulet DG',
    'Poulet DG',
    'Poulet, plantain mûr, légumes sautés',
    'Chicken, ripe plantain, sauteed vegetables',
    6500,
    'Oui',
    'Oui',
  ],
  [
    'Plats',
    'Main courses',
    'Poisson braisé attiéké',
    'Grilled fish with attieke',
    'Poisson du jour braisé, attiéké, oignons',
    'Grilled fish of the day, attieke, onions',
    7000,
    'Oui',
    'Oui',
  ],
  [
    'Boissons',
    'Drinks',
    'Jus de bissap',
    'Hibiscus juice',
    'Fait maison',
    'Homemade',
    1000,
    'Oui',
    'Non',
  ],
];

const GUIDE_LINES = [
  "Mode d'emploi : importer votre carte dans ATTABL",
  '',
  'En 3 étapes :',
  '  1. Remplissez l\'onglet "Carte", une ligne par plat. Remplacez les exemples par vos plats.',
  '  2. Enregistrez le fichier au format .xlsx (Classeur Excel).',
  '  3. Dans ATTABL, ouvrez Cartes > Importer Excel, choisissez la carte et déposez le fichier.',
  '',
  'Les colonnes :',
  "  Catégorie (obligatoire) : le rayon du plat, par exemple Entrées, Grillades, Boissons. Une catégorie qui n'existe pas encore est créée.",
  "  Nom du plat (obligatoire) : tel qu'il apparaît sur votre carte.",
  '  Prix (obligatoire) : en chiffres, dans la devise de votre établissement, sans symbole. Exemple : 3500 ou 3 500.',
  '  Description : facultative, 1000 caractères au maximum.',
  '  Disponible : Oui ou Non. Laissée vide, un nouveau plat est disponible.',
  '  En vedette : Oui ou Non. Un plat en vedette est mis en avant sur votre carte. Laissée vide : Non.',
  '  Colonnes EN : la traduction anglaise, facultative. Laissez-les vides si votre carte est seulement en français.',
  '',
  'Mettre à jour vos plats :',
  '  Rechargez le même fichier autant de fois que vous voulez.',
  '  Un plat déjà présent (même catégorie, même nom) est mis à jour : prix, description, disponibilité.',
  "  Un nouveau plat est ajouté. Aucun plat n'est supprimé : retirez-les depuis ATTABL.",
  '  Une case laissée vide ne remplace pas ce qui est déjà enregistré.',
  '',
  'À éviter :',
  "  Ne renommez pas les colonnes de la ligne d'en-têtes.",
  '  Ne mettez pas deux fois le même plat dans la même catégorie : la deuxième ligne est ignorée.',
  "  Pas de photo dans le fichier : ajoutez-les depuis ATTABL après l'import.",
];

/**
 * Generates the styled Excel template: the "Carte" sheet (headers + examples),
 * then a "Mode d'emploi" sheet. Returns the file as a Buffer ready for download.
 */
export async function generateExcelTemplate(): Promise<Buffer> {
  return buildStyledWorkbook({
    sheetName: 'Carte',
    title: "Ma carte - modèle d'import ATTABL",
    subtitle: "Une ligne par plat. Remplacez les exemples. Mode d'emploi dans le deuxième onglet.",
    columns: COLUMNS,
    rows: EXAMPLE_ROWS,
    guide: { sheetName: "Mode d'emploi", lines: GUIDE_LINES },
  });
}
