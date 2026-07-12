import { describe, it, expect } from 'vitest';
import { buildQRUrl } from '../build-qr-url';

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
