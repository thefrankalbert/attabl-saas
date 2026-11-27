/**
 * Niveau de stock d'un produit: UNE seule regle pour le badge de la liste, le
 * compteur du filtre et le filtre lui-meme (le filtre "Stock bas" comptait les
 * ruptures alors que le badge affichait 5 produits contre 14 lignes listees).
 */

export type StockLevel = 'out' | 'low' | 'ok';

export function getStockLevel(stock: {
  current_stock: number;
  min_stock_alert: number;
}): StockLevel {
  if (stock.current_stock <= 0) return 'out';
  if (stock.current_stock <= stock.min_stock_alert) return 'low';
  return 'ok';
}
