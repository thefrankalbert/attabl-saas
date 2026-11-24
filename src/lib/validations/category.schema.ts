import { z } from 'zod';

/**
 * Nom d'une categorie, en francais et en anglais: 100 caracteres au plus, comme
 * le nom d'une carte (menu.schema.ts). La colonne `categories.name` est un
 * `text` sans borne: sans cette limite, un nom de 408 caracteres etait accepte
 * (audit de mise en production du 2026-11-23). Meme valeur en `maxLength` sur
 * les champs du formulaire.
 */
export const CATEGORY_NAME_MAX = 100;

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Le nom est obligatoire.')
  .max(CATEGORY_NAME_MAX, `Maximum ${CATEGORY_NAME_MAX} caractères`);

export const categoryNameEnSchema = z
  .string()
  .trim()
  .max(CATEGORY_NAME_MAX, `Maximum ${CATEGORY_NAME_MAX} caractères`)
  .nullish();
