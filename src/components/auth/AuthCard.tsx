/**
 * Bordered card that wraps the interactive block (Google + divider + form, or a
 * success/state panel) on every auth surface. Ported 1:1 from the "Attabl
 * Connexion" prototype: white card, zinc border, 12px radius, 24px padding and a
 * hairline shadow. Title/subtitle sit ABOVE the card, footer links BELOW it.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] [@media(min-height:720px)_and_(max-height:819px)]:p-5 [@media(min-height:680px)_and_(max-height:719px)]:p-4 [@media(max-height:679px)]:p-3">
      {children}
    </div>
  );
}
