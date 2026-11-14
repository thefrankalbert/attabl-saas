import { z } from 'zod';

const FIELD_LABELS: Record<string, string> = {
  name: 'Le nom',
  name_en: 'Le nom anglais',
  description: 'La description',
  description_en: 'La description anglaise',
  price: 'Le prix',
  image_url: "L'adresse de l'image",
  title: 'Le titre',
  code: 'Le code',
};

function fieldLabel(path: ReadonlyArray<PropertyKey> | undefined): string {
  const last = path && path.length > 0 ? path[path.length - 1] : undefined;
  return (typeof last === 'string' && FIELD_LABELS[last]) || 'Ce champ';
}

interface IssueLike {
  code: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  path?: ReadonlyArray<PropertyKey>;
}

/**
 * Message francais pour une erreur Zod sans message explicite (audit C-063:
 * "Too big: expected string to have <=100 characters" arrivait tel quel a l'ecran).
 * Les messages deja ecrits dans les schemas gardent la priorite (customError
 * n'est appele que si le schema n'en fournit pas).
 */
function frenchZodMessage(issue: IssueLike): string | undefined {
  const label = fieldLabel(issue.path);
  const isString = issue.origin === 'string';
  if (issue.code === 'too_big') {
    return isString
      ? `${label} ne doit pas dépasser ${issue.maximum} caractères.`
      : `${label} est trop grand (maximum ${issue.maximum}).`;
  }
  if (issue.code === 'too_small') {
    return isString
      ? `${label} doit contenir au moins ${issue.minimum} caractères.`
      : `${label} est trop petit (minimum ${issue.minimum}).`;
  }
  if (issue.code === 'invalid_type') return `${label} est invalide ou manquant.`;
  if (issue.code === 'invalid_format') return `${label} n'a pas le bon format.`;
  return undefined;
}

z.config({ customError: (iss) => frenchZodMessage(iss as IssueLike) });
