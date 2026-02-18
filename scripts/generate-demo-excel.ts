/**
 * generate-demo-excel.ts
 *
 * Generates a pre-filled Excel template for the ATTABL menu import feature
 * using demo data from the fictional restaurant "L'Epicurien".
 *
 * Usage:
 *   npx tsx scripts/generate-demo-excel.ts
 *
 * Output:
 *   public/demo-menu-epicurien.xlsx
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ─── Column headers matching the import service expectations ──────

const headers = [
  'Category',
  'Category EN',
  'Dish Name',
  'Dish Name EN',
  'Description',
  'Description EN',
  'Price',
  'Available',
  'Featured',
];

// ─── Demo menu data for L'Epicurien ──────────────────────────────
// Prices are in centimes (integer) as expected by the import service.

const data: (string | number)[][] = [
  // ── Entrees / Starters ──
  [
    'Entrees',
    'Starters',
    'Foie Gras de Canard mi-cuit',
    'Pan-seared Duck Foie Gras',
    'Foie gras de canard mi-cuit, chutney de figues et pain brioche toaste',
    'Pan-seared duck foie gras with fig chutney and toasted brioche',
    18000,
    'Oui',
    'Oui',
  ],
  [
    'Entrees',
    'Starters',
    'Tartare de Saumon aux agrumes',
    'Citrus Salmon Tartare',
    'Saumon frais marine aux agrumes, avocat cremeux et chips de wonton',
    'Fresh salmon marinated in citrus, creamy avocado and wonton chips',
    15000,
    'Oui',
    'Non',
  ],
  [
    'Entrees',
    'Starters',
    'Veloute de Homard au cognac',
    'Lobster Bisque with Cognac',
    'Veloute onctueux de homard flambe au cognac, creme fouettee a la ciboulette',
    'Velvety lobster bisque flambeed with cognac, chive whipped cream',
    16500,
    'Oui',
    'Non',
  ],
  [
    'Entrees',
    'Starters',
    'Carpaccio de Boeuf wagyu',
    'Wagyu Beef Carpaccio',
    'Fines tranches de boeuf wagyu, roquette, copeaux de parmesan et truffe noire',
    'Thinly sliced wagyu beef, rocket, parmesan shavings and black truffle',
    22000,
    'Oui',
    'Oui',
  ],

  // ── Plats Signature / Signature Dishes ──
  [
    'Plats Signature',
    'Signature Dishes',
    'Filet de Boeuf Rossini',
    'Beef Tenderloin Rossini',
    'Filet de boeuf grille, escalope de foie gras poele, sauce Perigueux aux truffes',
    'Grilled beef tenderloin, pan-seared foie gras escalope, Perigueux truffle sauce',
    38000,
    'Oui',
    'Oui',
  ],
  [
    'Plats Signature',
    'Signature Dishes',
    "Carre d'Agneau en croute d'herbes",
    'Herb-crusted Rack of Lamb',
    "Carre d'agneau en croute de fines herbes, jus au romarin et gratin dauphinois",
    'Rack of lamb in a fine herb crust, rosemary jus and potato gratin',
    32000,
    'Oui',
    'Oui',
  ],
  [
    'Plats Signature',
    'Signature Dishes',
    'Magret de Canard au miel et epices',
    'Duck Breast with Honey and Spices',
    'Magret de canard roti au miel de lavande et cinq epices, puree de patate douce',
    'Roasted duck breast glazed with lavender honey and five spices, sweet potato puree',
    28000,
    'Oui',
    'Non',
  ],
  [
    'Plats Signature',
    'Signature Dishes',
    'Supreme de Volaille farci aux morilles',
    'Morel-stuffed Chicken Supreme',
    'Supreme de volaille fermiere farci aux morilles, sauce cremeuse au vin jaune',
    'Free-range chicken supreme stuffed with morels, creamy vin jaune sauce',
    26000,
    'Oui',
    'Non',
  ],

  // ── Poissons & Fruits de Mer / Fish & Seafood ──
  [
    'Poissons & Fruits de Mer',
    'Fish & Seafood',
    'Bar roti, beurre blanc au citron',
    'Roasted Sea Bass, Lemon Beurre Blanc',
    'Bar de ligne roti, beurre blanc au citron de Menton, legumes croquants',
    'Line-caught sea bass roasted to perfection, Menton lemon beurre blanc, crisp vegetables',
    30000,
    'Oui',
    'Non',
  ],
  [
    'Poissons & Fruits de Mer',
    'Fish & Seafood',
    'Gambas flambees au Pastis',
    'Pastis-flambeed King Prawns',
    'Gambas geantes flambees au Pastis, risotto cremeaux au safran',
    'Giant king prawns flambeed with Pastis, creamy saffron risotto',
    35000,
    'Oui',
    'Oui',
  ],
  [
    'Poissons & Fruits de Mer',
    'Fish & Seafood',
    'Pave de Thon mi-cuit, sesame',
    'Sesame-crusted Seared Tuna',
    'Pave de thon rouge mi-cuit en croute de sesame, wok de legumes asiatiques',
    'Seared red tuna steak in sesame crust, Asian-style stir-fried vegetables',
    27000,
    'Oui',
    'Non',
  ],
  [
    'Poissons & Fruits de Mer',
    'Fish & Seafood',
    'Sole meuniere, pommes grenaille',
    'Sole Meuniere with Baby Potatoes',
    'Sole meuniere doree au beurre noisette, pommes grenaille roties aux herbes',
    'Sole meuniere with brown butter, herb-roasted baby potatoes',
    34000,
    'Oui',
    'Non',
  ],

  // ── Desserts ──
  [
    'Desserts',
    'Desserts',
    'Fondant au chocolat Valrhona',
    'Valrhona Chocolate Fondant',
    'Fondant au chocolat noir Valrhona 70%, coeur coulant, glace vanille',
    'Valrhona 70% dark chocolate fondant, molten center, vanilla ice cream',
    12000,
    'Oui',
    'Non',
  ],
  [
    'Desserts',
    'Desserts',
    'Creme brulee a la vanille Bourbon',
    'Bourbon Vanilla Creme Brulee',
    'Creme brulee onctueuse infusee a la vanille Bourbon de Madagascar',
    'Silky creme brulee infused with Madagascar Bourbon vanilla',
    10000,
    'Oui',
    'Non',
  ],
  [
    'Desserts',
    'Desserts',
    'Tarte Tatin aux pommes',
    'Apple Tarte Tatin',
    'Tarte Tatin aux pommes caramelisees, creme fraiche epaisse',
    'Caramelized apple tarte Tatin served with thick creme fraiche',
    11000,
    'Oui',
    'Non',
  ],
  [
    'Desserts',
    'Desserts',
    'Assiette de fromages affines',
    'Artisan Cheese Board',
    'Selection de cinq fromages affines, confiture de cerises noires et noix',
    'Selection of five aged artisan cheeses, black cherry jam and walnuts',
    14000,
    'Oui',
    'Non',
  ],

  // ── Vins Rouges / Red Wines ──
  [
    'Vins Rouges',
    'Red Wines',
    'Chateau Margaux 2015',
    'Chateau Margaux 2015',
    'Grand cru classe, Margaux — notes de cassis, violette et cedre, tanins soyeux',
    'Grand cru classe, Margaux — blackcurrant, violet and cedar notes, silky tannins',
    180000,
    'Oui',
    'Non',
  ],
  [
    'Vins Rouges',
    'Red Wines',
    'Pomerol Petrus 2012',
    'Pomerol Petrus 2012',
    "Pomerol d'exception — aromes de truffe, mure et reglisse, finale persistante",
    'Exceptional Pomerol — truffle, blackberry and liquorice aromas, lingering finish',
    450000,
    'Oui',
    'Non',
  ],

  // ── Vins Blancs / White Wines ──
  [
    'Vins Blancs',
    'White Wines',
    'Chablis Premier Cru 2019',
    'Chablis Premier Cru 2019',
    'Bourgogne minerale — agrumes, pierre a fusil et fleurs blanches',
    'Mineral Burgundy — citrus, flint and white blossom notes',
    65000,
    'Oui',
    'Non',
  ],
  [
    'Vins Blancs',
    'White Wines',
    'Sancerre Domaine Vacheron',
    'Sancerre Domaine Vacheron',
    'Loire frais et vif — pamplemousse, buis et touche fumee',
    'Fresh and vibrant Loire — grapefruit, boxwood and smoky hints',
    48000,
    'Oui',
    'Non',
  ],

  // ── Champagnes ──
  [
    'Champagnes',
    'Champagnes',
    'Dom Perignon 2013',
    'Dom Perignon 2013',
    "Cuvee prestige — bulles fines, notes d'amande grillee, brioche et agrumes",
    'Prestige cuvee — fine bubbles, toasted almond, brioche and citrus notes',
    280000,
    'Oui',
    'Non',
  ],
  [
    'Champagnes',
    'Champagnes',
    'Veuve Clicquot Brut',
    'Veuve Clicquot Brut',
    'Champagne iconique — pomme verte, biscuit et touche de vanille, mousse persistante',
    'Iconic Champagne — green apple, biscuit and vanilla hint, persistent mousse',
    95000,
    'Oui',
    'Non',
  ],
];

// ─── Build workbook and write to file ────────────────────────────

const worksheetData = [headers, ...data];
const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

// Set column widths for readability
worksheet['!cols'] = [
  { wch: 25 }, // Category
  { wch: 22 }, // Category EN
  { wch: 38 }, // Dish Name
  { wch: 38 }, // Dish Name EN
  { wch: 75 }, // Description
  { wch: 75 }, // Description EN
  { wch: 10 }, // Price
  { wch: 12 }, // Available
  { wch: 12 }, // Featured
];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Menu L'Epicurien");

// Ensure output directory exists
const outputDir = path.resolve(__dirname, '..', 'public');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'demo-menu-epicurien.xlsx');
XLSX.writeFile(workbook, outputPath);

// eslint-disable-next-line no-console
console.log(`Demo Excel file generated successfully at: ${outputPath}`);
// eslint-disable-next-line no-console
console.log(`Total items: ${data.length}`);
// eslint-disable-next-line no-console
console.log(
  `Categories: ${new Set(data.map((row) => row[0])).size} (${[...new Set(data.map((row) => row[0]))].join(', ')})`,
);
