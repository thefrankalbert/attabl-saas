// Design tokens - espace client ATTABL
// Source de verite pour tous les composants tenant (refonte)

export const T = {
  // Surfaces
  bg: '#FFFFFF',
  bgSoft: '#FAFAF7',
  surface: '#F4F4F1',
  ivory: '#F5F1EA',
  ivoryInk: '#A8A092',
  border: '#ECEAE5',
  borderStrong: '#DCD9D2',

  // Encres
  ink: '#0E0E0E',
  ink2: '#3D3D3D',
  ink3: '#7A7A7A',
  ink4: '#B0B0B0',
  ink5: '#D0D0D0',

  // Brand
  brand: '#06C167',
  brandDark: '#04A357',
  brandSoft: '#E6F8EE',

  // Semantique
  warn: '#FFB800',
  danger: '#E11900',

  // Type
  font: '"Inter Tight", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',

  // Radii (px)
  r1: 10,
  r2: 14,
  r3: 18,
  rPill: 999,

  // Shadows
  sh1: '0 1px 2px rgba(15,15,15,0.04), 0 0 0 1px rgba(15,15,15,0.05)',
  sh2: '0 8px 24px rgba(15,15,15,0.08), 0 0 0 1px rgba(15,15,15,0.04)',
  shFloat: '0 12px 28px rgba(15,15,15,0.20)',
} as const;

export type Tokens = typeof T;

// Format montant : 50000 -> "50 000"
export function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
