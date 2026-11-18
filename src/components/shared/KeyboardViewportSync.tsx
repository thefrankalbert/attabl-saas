'use client';

import { useEffect } from 'react';

// Ecart minimal (px) entre la fenetre du navigateur et la zone visible pour
// considerer que le clavier virtuel est ouvert. En dessous, c'est la barre
// d'adresse qui bouge, pas un clavier.
const KEYBOARD_MIN_HEIGHT = 120;

/**
 * Sur iPad et iPhone, le clavier virtuel ne reduit pas la page: il la recouvre.
 * Une fenetre (Dialog) centree sur tout l'ecran garde alors son bas - derniers
 * champs, bouton Enregistrer - SOUS le clavier, sans aucun moyen d'y acceder
 * (constate sur iPad simule, fenetre "Ajouter un fournisseur", 2026-11-17).
 *
 * Ce composant publie la zone reellement visible (visualViewport) en variables
 * CSS et marque <html data-keyboard="open"> tant que le clavier est ouvert.
 * La regle de keyboard-viewport.css cale alors toute fenetre ouverte dans cette
 * zone et la rend defilable. Clavier ferme: aucun changement de rendu.
 */
export function KeyboardViewportSync(): null {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;

    const sync = () => {
      const open = window.innerHeight - vv.height > KEYBOARD_MIN_HEIGHT;
      if (open) {
        root.dataset.keyboard = 'open';
        root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
        root.style.setProperty('--vv-height', `${vv.height}px`);
      } else {
        delete root.dataset.keyboard;
        root.style.removeProperty('--vv-top');
        root.style.removeProperty('--vv-height');
      }
    };

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      delete root.dataset.keyboard;
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
    };
  }, []);

  return null;
}
