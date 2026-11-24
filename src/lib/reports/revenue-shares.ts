/**
 * Parts du chiffre d'affaires, en pourcentages entiers qui totalisent 100.
 *
 * Un espace dont les remboursements depassent les encaissements a un chiffre
 * negatif sur la periode: sa part vaut 0 (une part negative n'a pas de sens),
 * et les parts se calculent sur les seuls chiffres positifs. L'arrondi suit la
 * methode du plus fort reste, pour que la somme fasse exactement 100.
 */
export function revenueShares(revenues: number[]): number[] {
  const positive = revenues.map((r) => Math.max(r, 0));
  const total = positive.reduce((s, r) => s + r, 0);
  if (total === 0) return revenues.map(() => 0);

  const exact = positive.map((r) => (r / total) * 100);
  const shares = exact.map(Math.floor);
  let missing = 100 - shares.reduce((s, v) => s + v, 0);
  const byRemainder = exact
    .map((v, i) => ({ i, rest: v - Math.floor(v) }))
    .filter((x) => positive[x.i] > 0)
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    shares[i] += 1;
    missing -= 1;
  }
  return shares;
}
