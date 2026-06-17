// Sensible upper bound on the quantity of a single cart line. Prevents the
// "+" from ballooning a line into absurd quantities (and the total/badge into
// huge numbers). The detail sheet, the card stepper and the cart stepper all
// share this cap.
export const MAX_ITEM_QTY = 99;

// Badge display for the cart count: above the cap, show "99+" so the small
// badge never has to render 3+ digits.
export function formatCartCount(count: number): string {
  return count > MAX_ITEM_QTY ? `${MAX_ITEM_QTY}+` : String(count);
}

// How many more units of a line can still be added before hitting the cap.
// Used by the "add to cart" paths that increment one unit at a time (upsell,
// reorder) so a single line never climbs past MAX_ITEM_QTY.
export function remainingItemCapacity(currentQty: number): number {
  return Math.max(0, MAX_ITEM_QTY - currentQty);
}
