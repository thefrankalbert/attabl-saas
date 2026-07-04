// --- Excel Template Generation --------------------------------

/**
 * Generates a blank Excel template with correct headers and example rows.
 * Returns the file as a Buffer ready for download.
 */
export async function generateExcelTemplate(): Promise<Buffer> {
  const XLSX = await import('xlsx');
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

  const worksheetData = [headers, ...exampleRows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths for readability
  worksheet['!cols'] = [
    { wch: 20 }, // Category
    { wch: 20 }, // Category EN
    { wch: 25 }, // Dish Name
    { wch: 25 }, // Dish Name EN
    { wch: 40 }, // Description
    { wch: 40 }, // Description EN
    { wch: 10 }, // Price
    { wch: 12 }, // Available
    { wch: 12 }, // Featured
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu Import');

  // Write as buffer
  const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return output as Buffer;
}
