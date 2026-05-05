import { formatCurrency } from '@/lib/utils/currency';

export function fmtFCFA(n: number): string {
  return formatCurrency(n, 'XAF');
}
