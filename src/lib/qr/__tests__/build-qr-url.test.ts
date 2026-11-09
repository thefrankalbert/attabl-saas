import { describe, it, expect } from 'vitest';
import { buildQRUrl } from '../build-qr-url';
import { resolveTableParam } from '../table-param';

const BASE = 'https://resto.attabl.com';

describe('buildQRUrl', () => {
  it('tenant root when no menu and no table', () => {
    expect(buildQRUrl(BASE)).toBe(`${BASE}/`);
  });

  it('adds ?table= for the table identifier, at the tenant root', () => {
    const url = new URL(buildQRUrl(BASE, '12'));
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('table')).toBe('12');
    expect(url.searchParams.get('menu')).toBeNull();
  });

  it('points at /menu and adds ?menu= when a menu slug is given', () => {
    const url = new URL(buildQRUrl(BASE, undefined, 'brunch'));
    expect(url.pathname).toBe('/menu');
    expect(url.searchParams.get('menu')).toBe('brunch');
    expect(url.searchParams.get('table')).toBeNull();
  });

  it('encodes both table and menu together', () => {
    const url = new URL(buildQRUrl(BASE, 'Terrasse 3', 'brunch'));
    expect(url.pathname).toBe('/menu');
    expect(url.searchParams.get('table')).toBe('Terrasse 3'); // decoded getter; encoded in the string
    expect(url.searchParams.get('menu')).toBe('brunch');
    expect(buildQRUrl(BASE, 'Terrasse 3', 'brunch')).toContain('table=Terrasse+3');
  });
});

describe('resolveTableParam (every QR entry reads the table the same way)', () => {
  it('reads the table of a root QR built by buildQRUrl', () => {
    const url = new URL(buildQRUrl(BASE, 'TER-1'));
    expect(resolveTableParam(Object.fromEntries(url.searchParams))).toBe('TER-1');
  });

  it('falls back to the legacy ?t= and keeps the first of a repeated param', () => {
    expect(resolveTableParam({ t: 'SAL-1' })).toBe('SAL-1');
    expect(resolveTableParam({ table: ['A', 'B'] })).toBe('A');
    expect(resolveTableParam({ table: '' })).toBeUndefined();
    expect(resolveTableParam({})).toBeUndefined();
  });
});
