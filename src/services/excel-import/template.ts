// --- Excel Template Generation --------------------------------

import { buildStyledWorkbook, type StyledColumn } from '@/lib/exports/styled-workbook';

const COLUMNS: StyledColumn[] = [
  { header: 'Category', width: 20 },
  { header: 'Category EN', width: 20 },
  { header: 'Dish Name', width: 25 },
  { header: 'Dish Name EN', width: 25 },
  { header: 'Description', width: 40 },
  { header: 'Description EN', width: 40 },
  { header: 'Price', width: 10, numeric: true },
  { header: 'Available', width: 12 },
  { header: 'Featured', width: 12 },
];

/**
 * Generates a styled Excel template with correct headers and example rows.
 * Returns the file as a Buffer ready for download.
 */
export async function generateExcelTemplate(): Promise<Buffer> {
  const exampleRows = [
    [
      'Entrées',
      'Starters',
      "Soupe à l'oignon",
      'French Onion Soup',
      'Soupe gratinée traditionnelle',
      'Traditional gratinéed soup',
      12.5,
      'Oui',
      'Non',
    ],
    [
      'Entrées',
      'Starters',
      'Salade César',
      'Caesar Salad',
      'Laitue romaine, croûtons, parmesan',
      'Romaine lettuce, croutons, parmesan',
      14.0,
      'Oui',
      'Oui',
    ],
    [
      'Plats principaux',
      'Main Courses',
      'Steak frites',
      'Steak and Fries',
      'Entrecôte grillée, frites maison',
      'Grilled rib-eye, house fries',
      28.0,
      'Oui',
      'Oui',
    ],
    [
      'Plats principaux',
      'Main Courses',
      'Saumon grillé',
      'Grilled Salmon',
      "Saumon de l'Atlantique, légumes de saison",
      'Atlantic salmon, seasonal vegetables',
      26.5,
      'Oui',
      'Non',
    ],
    [
      'Desserts',
      'Desserts',
      'Crème brûlée',
      'Crème Brûlée',
      'À la vanille de Madagascar',
      'Madagascar vanilla',
      11.0,
      'Oui',
      'Non',
    ],
  ];

  return buildStyledWorkbook({
    sheetName: 'Menu Import',
    title: 'Import menu - ATTABL',
    subtitle: 'Modele a remplir. Une ligne par plat. Ne pas modifier les en-tetes.',
    columns: COLUMNS,
    rows: exampleRows,
  });
}
