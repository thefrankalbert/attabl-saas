/**
 * Wraps the interactive block (Google + divider + form, or a success/state
 * panel) of an auth screen. It used to draw a bordered card; since 2026-11-23
 * the white card of the photo frame (AuthFrame) is the only card, so this is a
 * plain grouping element: no card inside the card.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
