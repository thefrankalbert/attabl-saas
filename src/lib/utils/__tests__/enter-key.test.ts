import { describe, it, expect } from 'vitest';
import { isEnterToSubmit } from '../enter-key';

const touche = (key: string, keyCode: number, isComposing = false) => ({
  key,
  keyCode,
  nativeEvent: { isComposing },
});

describe('isEnterToSubmit', () => {
  it('accepte Entree tapee normalement', () => {
    expect(isEnterToSubmit(touche('Enter', 13))).toBe(true);
  });

  it('refuse Entree qui confirme une composition (Chrome, Firefox)', () => {
    expect(isEnterToSubmit(touche('Enter', 229, true))).toBe(false);
  });

  it('refuse Entree de composition que Safari signale avec isComposing faux', () => {
    expect(isEnterToSubmit(touche('Enter', 229, false))).toBe(false);
  });

  it('ignore les autres touches', () => {
    expect(isEnterToSubmit(touche('Escape', 27))).toBe(false);
    expect(isEnterToSubmit(touche('a', 65))).toBe(false);
  });
});
