import { describe, it, expect } from 'vitest';
import { contactSchema } from '../contact.schema';

const valide = {
  name: 'Awa Ouedraogo',
  email: 'awa@example.com',
  message: 'Bonjour, je voudrais une demonstration.',
};

describe('contactSchema', () => {
  it('accepte un formulaire complet', () => {
    expect(contactSchema.safeParse(valide).success).toBe(true);
  });

  it('refuse un nom fait seulement d espaces', () => {
    const r = contactSchema.safeParse({ ...valide, name: '  ' });
    expect(r.success).toBe(false);
  });

  it('refuse un message fait seulement d espaces', () => {
    const r = contactSchema.safeParse({ ...valide, message: ' '.repeat(10) });
    expect(r.success).toBe(false);
  });

  it('compte la longueur apres suppression des espaces autour', () => {
    const r = contactSchema.safeParse({ ...valide, message: '   court   ' });
    expect(r.success).toBe(false);
  });

  it('rend le nom sans espaces autour', () => {
    const r = contactSchema.safeParse({ ...valide, name: '  Awa  ' });
    expect(r.success && r.data.name).toBe('Awa');
  });
});
