import { describe, it, expect } from 'vitest';
import { uniqueConflictOr } from '../errors';

describe('uniqueConflictOr', () => {
  it('turns a unique violation into a CONFLICT with the readable message', () => {
    const err = uniqueConflictOr({ code: '23505' }, 'Un fournisseur porte déjà ce nom.', 'x');
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('Un fournisseur porte déjà ce nom.');
  });

  it('keeps any other database error INTERNAL with the fallback message', () => {
    const err = uniqueConflictOr({ code: '42501' }, 'doublon', 'Erreur creation fournisseur');
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toBe('Erreur creation fournisseur');
  });
});
