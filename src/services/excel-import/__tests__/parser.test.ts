/**
 * Lecture d'un fichier Excel de carte, envoye par un restaurateur.
 *
 * C'est une entree NON MAITRISEE qui finit en prix de vente. Le module
 * n'avait aucun test alors qu'il decide, ligne par ligne, ce qui entre en base
 * et ce qui est refuse.
 *
 * Regle de conception verifiee ici: une ligne fautive ne fait pas echouer tout
 * le fichier. Un restaurateur avec 200 plats et une faute de frappe a la ligne
 * 57 doit importer les 199 autres et voir precisement laquelle corriger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lireFeuille = vi.hoisted(() => vi.fn());
vi.mock('@/lib/excel-parse', async (original) => ({
  // Seule la lecture du classeur est simulee: l'analyse des cellules, elle,
  // doit etre testee pour de vrai - c'est la ou l'argent se joue.
  ...(await original<typeof import('@/lib/excel-parse')>()),
  readFirstSheetRows: lireFeuille,
}));

import { parseExcelBuffer } from '../parser';

const ENTETES = ['Catégorie', 'Nom du plat', 'Description', 'Prix', 'Disponible', 'En vedette'];
const tampon = new ArrayBuffer(8);

/** Remplit la feuille simulee avec des en-tetes et des lignes. */
function feuille(lignes: unknown[][], entetes: string[] = ENTETES) {
  lireFeuille.mockResolvedValue([entetes, ...lignes]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseExcelBuffer - refus du fichier entier', () => {
  it('refuse un classeur sans feuille', async () => {
    lireFeuille.mockRejectedValue(new Error('EMPTY_WORKBOOK'));

    await expect(parseExcelBuffer(tampon)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('rend zero ligne pour un fichier sans aucune ligne de donnees', async () => {
    // Le refus "aucun plat" est porte par le service (importFromExcel).
    lireFeuille.mockResolvedValue([ENTETES]);

    await expect(parseExcelBuffer(tampon)).resolves.toEqual({ rows: [], errors: [] });
  });

  it('trouve les en-tetes sous la bande de titre du modele ATTABL', async () => {
    // Regression: le modele telecharge (titre en ligne 1, sous-titre en ligne
    // 2, en-tetes en ligne 4) etait refuse par l'import qui lisait la ligne 1.
    lireFeuille.mockResolvedValue([
      Array(6).fill("Ma carte - modele d'import ATTABL"),
      Array(6).fill('Une ligne par plat.'),
      [],
      ENTETES,
      ['Plats', 'Poulet DG', '', 6500, 'Oui', 'Non'],
    ]);

    const { rows, errors } = await parseExcelBuffer(tampon);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Poulet DG', price: 6500, rowNumber: 5 });
  });

  it('nomme les colonnes obligatoires manquantes', async () => {
    // Sans ce message, le restaurateur voit "erreur" et ne sait pas quoi
    // corriger dans son fichier.
    lireFeuille.mockResolvedValue([
      ['Nom du plat', 'Description'],
      ['Pizza', 'bonne'],
    ]);

    await expect(parseExcelBuffer(tampon)).rejects.toThrow(/Colonnes obligatoires introuvables/);
    await expect(parseExcelBuffer(tampon)).rejects.toThrow(/Categorie/);
    await expect(parseExcelBuffer(tampon)).rejects.toThrow(/Prix/);
  });

  it('laisse remonter une panne de lecture qui n est pas un classeur vide', async () => {
    lireFeuille.mockRejectedValue(new Error('fichier corrompu'));

    await expect(parseExcelBuffer(tampon)).rejects.toThrow('fichier corrompu');
  });
});

describe('parseExcelBuffer - separateur de milliers (defaut corrige)', () => {
  it('lit 1,500 comme mille cinq cents, pas comme un virgule cinq', async () => {
    // Excel en locale anglaise ecrit les milliers avec une virgule. L'ancienne
    // lecture rendait 1.5: le plat partait a 1,5 FCFA au lieu de 1 500.
    feuille([['Plats', 'Poulet DG', '', '1,500', 'Oui', 'Non']]);

    const { rows, errors } = await parseExcelBuffer(tampon);

    expect(errors).toEqual([]);
    expect(rows[0].price).toBe(1500);
  });

  it('lit le format europeen 1.500,75', async () => {
    feuille([['Plats', 'Poulet DG', '', '1.500,75', 'Oui', 'Non']]);

    const { rows } = await parseExcelBuffer(tampon);

    expect(rows[0].price).toBe(1500.75);
  });

  it('lit encore correctement un prix a decimales 12,50', async () => {
    // Le correctif ne doit pas casser le cas d'origine.
    feuille([['Boissons', 'Cafe', '', '12,50', 'Oui', 'Non']]);

    const { rows } = await parseExcelBuffer(tampon);

    expect(rows[0].price).toBe(12.5);
  });

  it('accepte un prix accompagne de sa devise', async () => {
    feuille([['Plats', 'Attieke', '', '2 500 FCFA', 'Oui', 'Non']]);

    const { rows } = await parseExcelBuffer(tampon);

    expect(rows[0].price).toBe(2500);
  });

  it('refuse un prix negatif au lieu de le rendre positif', async () => {
    // Le signe est conserve pour que la validation puisse le refuser. Le
    // supprimer transformerait une faute de saisie en prix valide.
    feuille([['Plats', 'Erreur', '', '-500', 'Oui', 'Non']]);

    const { rows, errors } = await parseExcelBuffer(tampon);

    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/superieur a zero/i);
  });
});

describe('parseExcelBuffer - ligne par ligne', () => {
  it('une ligne fautive n empeche pas les autres de passer', async () => {
    feuille([
      ['Plats', 'Bon plat', '', '1000', 'Oui', 'Non'],
      ['Plats', 'Sans prix', '', '', 'Oui', 'Non'],
      ['Plats', 'Autre bon', '', '2000', 'Oui', 'Non'],
    ]);

    const { rows, errors } = await parseExcelBuffer(tampon);

    expect(rows.map((r) => r.name)).toEqual(['Bon plat', 'Autre bon']);
    expect(errors).toHaveLength(1);
  });

  it('designe la ligne fautive par son numero tel qu affiche dans Excel', async () => {
    // Excel compte a partir de 1 et la premiere ligne est l'en-tete: la
    // premiere ligne de donnees est donc la 2. Un decalage enverrait le
    // restaurateur corriger la mauvaise ligne.
    feuille([
      ['Plats', 'Bon', '', '1000', 'Oui', 'Non'],
      ['Plats', 'Mauvais', '', 'abc', 'Oui', 'Non'],
    ]);

    const { rows, errors } = await parseExcelBuffer(tampon);

    expect(rows[0].rowNumber).toBe(2);
    expect(errors[0].row).toBe(3);
  });

  it('signale un prix illisible plutot que de l ignorer', async () => {
    feuille([['Plats', 'Plat', '', 'gratuit', 'Oui', 'Non']]);

    const { rows, errors } = await parseExcelBuffer(tampon);

    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/prix manquant ou illisible/i);
  });

  it('saute les lignes entierement vides sans les compter en erreur', async () => {
    // Les fichiers reels sont pleins de lignes vides en bas de feuille.
    feuille([
      ['Plats', 'Plat', '', '1000', 'Oui', 'Non'],
      [],
      [null, null, null, null, null, null],
      ['', '', '', '', '', ''],
    ]);

    const { rows, errors } = await parseExcelBuffer(tampon);

    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it('refuse une ligne sans nom de plat', async () => {
    feuille([['Plats', '', '', '1000', 'Oui', 'Non']]);

    const { rows, errors } = await parseExcelBuffer(tampon);

    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/nom du plat obligatoire/i);
  });

  it('nettoie les espaces autour des textes', async () => {
    feuille([['  Plats  ', '  Poulet  ', '  bon  ', '1000', 'Oui', 'Non']]);

    const { rows } = await parseExcelBuffer(tampon);

    expect(rows[0]).toMatchObject({ category: 'Plats', name: 'Poulet', description: 'bon' });
  });

  it('rend null pour un texte optionnel vide, pas une chaine vide', async () => {
    feuille([['Plats', 'Poulet', '', '1000', 'Oui', 'Non']]);

    const { rows } = await parseExcelBuffer(tampon);

    expect(rows[0].description).toBeNull();
    expect(rows[0].nameEn).toBeNull();
  });
});

describe('parseExcelBuffer - disponibilite et mise en avant', () => {
  it('rend null pour une case vide (defaut a la creation, valeur gardee a la mise a jour)', async () => {
    // Le defaut (disponible, pas en vedette) est applique a la creation par
    // bulkImportMenuRows; pour un plat existant, une case vide ne change rien.
    feuille([['Plats', 'Poulet', '', '1000', '', '']]);

    const { rows } = await parseExcelBuffer(tampon);

    expect(rows[0].isAvailable).toBeNull();
    expect(rows[0].isFeatured).toBeNull();
  });

  it('comprend les reponses francaises et anglaises', async () => {
    feuille([
      ['Plats', 'A', '', '1000', 'Non', 'Oui'],
      ['Plats', 'B', '', '1000', 'No', 'Yes'],
      ['Plats', 'C', '', '1000', 'X', 'V'],
    ]);

    const { rows } = await parseExcelBuffer(tampon);

    expect(rows.map((r) => r.isAvailable)).toEqual([false, false, false]);
    expect(rows.map((r) => r.isFeatured)).toEqual([true, true, true]);
  });

  it('retombe sur la valeur par defaut devant une reponse incomprehensible', async () => {
    feuille([['Plats', 'Poulet', '', '1000', 'peut-etre', 'bof']]);

    const { rows } = await parseExcelBuffer(tampon);

    expect(rows[0].isAvailable).toBe(true);
    expect(rows[0].isFeatured).toBe(false);
  });
});

describe('parseExcelBuffer - colonnes en desordre', () => {
  it('suit l ordre reel des colonnes du fichier', async () => {
    // Personne ne respecte l'ordre du modele. Lire par position fixe
    // attribuerait le prix au nom.
    feuille([['1200', 'Poulet', 'Plats']], ['Prix', 'Nom du plat', 'Catégorie']);

    const { rows } = await parseExcelBuffer(tampon);

    expect(rows[0]).toMatchObject({ price: 1200, name: 'Poulet', category: 'Plats' });
  });

  it('accepte un fichier anglais', async () => {
    feuille([['Mains', 'Chicken', '1200']], ['Category', 'Dish Name', 'Price']);

    const { rows } = await parseExcelBuffer(tampon);

    expect(rows[0]).toMatchObject({ category: 'Mains', name: 'Chicken', price: 1200 });
  });
});
