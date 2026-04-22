// Format FCFA refonte: rounded integer, NBSP (U+00A0) thousands separator,
// NBSP before the "FCFA" suffix. Example: 8500 -> "8 500 FCFA".
//
// Intentionally distinct from CurrencyContext.formatDisplayPrice (which uses
// a thin-space separator). This helper is used exclusively by the refonte
// atoms/molecules until Phase 6 unifies both.
export function formatFCFA(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const absStr = Math.abs(rounded).toString();
  const withNbsp = absStr.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return sign + withNbsp + '\u00A0FCFA';
}
