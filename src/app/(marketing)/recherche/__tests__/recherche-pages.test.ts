import { describe, it, expect } from 'vitest';

import { PAGES } from '../page';
import fr from '@/messages/fr-FR.json';
import en from '@/messages/en-US.json';

/**
 * La recherche du site ne lit PAS le contenu des pages: elle filtre une liste
 * ecrite en dur sur un titre et une description rediges a la main dans les
 * fichiers de traduction.
 *
 * Deux oublis sont donc possibles, et silencieux:
 *   - ajouter une page au site sans l'ajouter a la liste: elle reste
 *     introuvable. C'etait le cas des trois articles du blog, du support et
 *     des pages legales jusqu'au 2026-11-06;
 *   - ajouter une entree a la liste sans sa traduction: la page de recherche
 *     affiche alors la cle brute, ou echoue.
 *
 * Ce test attrape le second cas, dans les deux langues, et fige le premier
 * pour les pages qui comptent.
 */

interface EntreeTraduite {
  title: string;
  description: string;
}

const traductions: Record<string, Record<string, EntreeTraduite>> = {
  'fr-FR': fr.marketing.recherche.pages as unknown as Record<string, EntreeTraduite>,
  'en-US': en.marketing.recherche.pages as unknown as Record<string, EntreeTraduite>,
};

/** Meme normalisation que la recherche: casse et accents ignores. */
const DIACRITIQUES = new RegExp('[\\u0300-\\u036f]', 'g');
const normalise = (valeur: string) =>
  valeur.toLowerCase().normalize('NFD').replace(DIACRITIQUES, '');

describe('pages indexees par la recherche du site', () => {
  it('chaque entree de la liste a une traduction dans les deux langues', () => {
    for (const [langue, pages] of Object.entries(traductions)) {
      for (const { key } of PAGES) {
        const entree = pages[key];
        expect(entree, `${langue}: traduction manquante pour "${key}"`).toBeDefined();
        expect(entree.title.trim().length, `${langue}: titre vide pour "${key}"`).toBeGreaterThan(
          0,
        );
        expect(
          entree.description.trim().length,
          `${langue}: description vide pour "${key}"`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('aucune traduction orpheline: toute entree traduite figure dans la liste', () => {
    const cles = new Set(PAGES.map((page) => page.key as string));
    for (const [langue, pages] of Object.entries(traductions)) {
      for (const cle of Object.keys(pages)) {
        expect(cles.has(cle), `${langue}: "${cle}" est traduit mais absent de la liste`).toBe(true);
      }
    }
  });

  it('les trois articles du blog sont trouvables', () => {
    // Le contenu qui amene des visiteurs etait le seul a ne pas etre indexe.
    const chemins = PAGES.map((page) => page.href as string);
    expect(chemins).toContain('/blog/gestion-stock-commerce-afrique');
    expect(chemins).toContain('/blog/menu-qr-code-restaurant');
    expect(chemins).toContain('/blog/pos-mobile-money-afrique');
  });

  it('le support et les pages legales sont trouvables', () => {
    const chemins = PAGES.map((page) => page.href as string);
    expect(chemins).toContain('/support');
    expect(chemins).toContain('/legal');
    expect(chemins).toContain('/privacy');
  });

  it('les mots que les restaurateurs tapent vraiment donnent un resultat', () => {
    const pages = traductions['fr-FR'];
    const corpus = PAGES.map(({ key }) =>
      normalise(`${pages[key].title} ${pages[key].description}`),
    );

    for (const mot of ['qr code', 'mobile money', 'stock', 'aide', 'fcfa', 'imprimante', 'demo']) {
      expect(
        corpus.some((texte) => texte.includes(normalise(mot))),
        `aucune page ne repond a "${mot}"`,
      ).toBe(true);
    }
  });
});
