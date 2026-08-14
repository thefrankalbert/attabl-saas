/**
 * Reconnaissance des colonnes d'un fichier Excel envoye par un restaurateur.
 *
 * Personne n'ecrit ses en-tetes de la meme facon: "Prix", "PRIX", "prix ",
 * "Categorie", "Catégorie". Si une colonne n'est pas reconnue, elle est
 * simplement ignoree - donc un fichier parfaitement valide peut etre refuse
 * pour "colonne manquante", ou pire, importe sans les descriptions.
 *
 * Ce module n'avait aucun test.
 */
import { describe, it, expect } from 'vitest';
import { normalizeHeader, mapHeaders, COLUMN_ALIASES } from '../columns';

describe('normalizeHeader', () => {
  it('ignore la casse', () => {
    expect(normalizeHeader('PRIX')).toBe('prix');
    expect(normalizeHeader('Prix')).toBe('prix');
  });

  it('ignore les accents', () => {
    // Le cas francais par excellence: "Catégorie" et "Categorie" doivent
    // designer la meme colonne.
    expect(normalizeHeader('Catégorie')).toBe('categorie');
    expect(normalizeHeader('Décrïptïon')).toBe('decription');
  });

  it('ignore tous les espaces, y compris interieurs', () => {
    expect(normalizeHeader('  Nom du plat  ')).toBe('nomduplat');
    expect(normalizeHeader('Dish\tName')).toBe('dishname');
  });

  it('rend une chaine vide pour un en-tete vide', () => {
    expect(normalizeHeader('')).toBe('');
    expect(normalizeHeader('   ')).toBe('');
  });
});

describe('mapHeaders', () => {
  it('reconnait un fichier francais', () => {
    const m = mapHeaders(['Catégorie', 'Nom du plat', 'Description', 'Prix', 'Disponible']);

    expect(m.get(0)).toBe('category');
    expect(m.get(1)).toBe('name');
    expect(m.get(2)).toBe('description');
    expect(m.get(3)).toBe('price');
    expect(m.get(4)).toBe('available');
  });

  it('reconnait un fichier anglais', () => {
    const m = mapHeaders(['Category', 'Dish Name', 'Price', 'Available', 'Featured']);

    expect([...m.values()]).toEqual(['category', 'name', 'price', 'available', 'featured']);
  });

  it('distingue les colonnes francaises des anglaises', () => {
    // Un menu bilingue a les deux. Les confondre ecraserait le francais par
    // l'anglais, ou l'inverse.
    const m = mapHeaders(['Nom', 'Name EN', 'Description', 'Description EN']);

    expect(m.get(0)).toBe('name');
    expect(m.get(1)).toBe('nameEn');
    expect(m.get(2)).toBe('description');
    expect(m.get(3)).toBe('descriptionEn');
  });

  it('ignore les colonnes inconnues sans casser les autres', () => {
    // Les restaurateurs ajoutent leurs propres colonnes (notes, fournisseur).
    // Elles doivent etre ignorees, pas faire echouer l'import.
    const m = mapHeaders(['Catégorie', 'Notes internes', 'Prix']);

    expect(m.size).toBe(2);
    expect(m.get(0)).toBe('category');
    expect(m.get(2)).toBe('price');
    expect(m.has(1)).toBe(false);
  });

  it('conserve la position reelle de chaque colonne', () => {
    // La cle de la table est l'INDEX de colonne. Un decalage lirait le prix
    // dans la colonne du nom.
    const m = mapHeaders(['', '', 'Prix']);

    expect(m.get(2)).toBe('price');
  });

  it('rend une table vide quand rien n est reconnu', () => {
    expect(mapHeaders(['aaa', 'bbb']).size).toBe(0);
    expect(mapHeaders([]).size).toBe(0);
  });

  it('accepte les synonymes courants du prix', () => {
    for (const entete of ['Prix', 'Price', 'Tarif', 'Cout', 'Cost']) {
      expect(mapHeaders([entete]).get(0)).toBe('price');
    }
  });

  it('aucun alias n est revendique par deux champs differents', () => {
    // Un alias partage rendrait la reconnaissance dependante de l'ordre de
    // declaration: la meme colonne changerait de sens sans raison visible.
    const vus = new Map<string, string>();
    for (const [champ, alias] of Object.entries(COLUMN_ALIASES)) {
      for (const a of alias) {
        expect(vus.has(a), `alias "${a}" partage entre ${vus.get(a)} et ${champ}`).toBe(false);
        vus.set(a, champ);
      }
    }
  });

  it('tous les alias sont deja sous forme normalisee', () => {
    // Un alias contenant une majuscule ou un accent ne serait JAMAIS trouve:
    // la recherche se fait sur l'en-tete normalise. Panne silencieuse.
    for (const [champ, alias] of Object.entries(COLUMN_ALIASES)) {
      for (const a of alias) {
        expect(normalizeHeader(a), `alias "${a}" de ${champ} n'est pas normalise`).toBe(a);
      }
    }
  });
});
