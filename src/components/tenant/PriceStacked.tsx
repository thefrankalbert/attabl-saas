// Renders a formatted price ("18 000 FCFA") with the currency unit de-emphasized
// on a second line below the number, right-aligned, per the convive maquettes
// (order tracking + order detail). The thousands separator is a thin space
// (U+2009); the unit is always preceded by a regular ASCII space, so the last
// ASCII space cleanly splits the number from the unit.
function splitPrice(formatted: string): { num: string; unit: string } {
  const i = formatted.lastIndexOf(' ');
  return i === -1
    ? { num: formatted, unit: '' }
    : { num: formatted.slice(0, i), unit: formatted.slice(i + 1) };
}

export function PriceStacked({ value, numClass }: { value: string; numClass: string }) {
  const { num, unit } = splitPrice(value);
  return (
    <span className="flex flex-col items-end leading-none">
      <span className={`tabular-nums ${numClass}`}>{num}</span>
      {unit && (
        <span className="mt-[3px] text-[10px] font-medium text-[var(--color-ink-soft)]">
          {unit}
        </span>
      )}
    </span>
  );
}
