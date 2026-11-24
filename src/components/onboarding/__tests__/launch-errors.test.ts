import { describe, it, expect } from 'vitest';
import { launchFixKey } from '../utils/launch-errors';

describe('launchFixKey', () => {
  it('renvoie vers l ecran des tables pour une zone trop grande', () => {
    expect(
      launchFixKey(['data.tableZones.0.tableCount: Too big: expected number to be <=200']),
    ).toBe('launchFixTables');
  });

  it('prend la premiere erreur reconnue, couleur comprise', () => {
    expect(
      launchFixKey(['data.primaryColor: Invalid string: must match pattern', 'data.phone: x']),
    ).toBe('launchFixBranding');
  });

  it('retombe sur le message general pour un champ inconnu ou une liste vide', () => {
    expect(launchFixKey(['data.autreChose: x'])).toBe('launchFixGeneric');
    expect(launchFixKey([])).toBe('launchFixGeneric');
  });
});
