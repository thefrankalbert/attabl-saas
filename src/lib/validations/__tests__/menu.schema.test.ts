import { describe, it, expect } from 'vitest';
import { createMenuSchema, updateMenuSchema } from '../menu.schema';

const ID = '11111111-1111-4111-8111-111111111111';

describe('updateMenuSchema (audit B25)', () => {
  it('activer ou desactiver une carte ne remet ni son ordre ni son caractere transversal', () => {
    const parsed = updateMenuSchema.parse({ id: ID, is_active: false });
    expect(parsed).toEqual({ id: ID, is_active: false });
    expect('display_order' in parsed).toBe(false);
    expect('is_transversal_menu' in parsed).toBe(false);
  });

  it('une edition par formulaire sans display_order ne le remet pas a 0', () => {
    const parsed = updateMenuSchema.parse({ id: ID, name: 'Carte du soir' });
    expect(parsed.display_order).toBeUndefined();
    expect(parsed.is_active).toBeUndefined();
  });

  it('temoin: la creation applique toujours les valeurs par defaut', () => {
    const parsed = createMenuSchema.parse({ name: 'Carte du soir' });
    expect(parsed).toMatchObject({ is_active: true, is_transversal_menu: false, display_order: 0 });
  });

  it('les bornes restent appliquees a la mise a jour', () => {
    expect(updateMenuSchema.safeParse({ id: ID, display_order: -1 }).success).toBe(false);
    expect(updateMenuSchema.safeParse({ id: ID, name: 'a' }).success).toBe(false);
  });
});
