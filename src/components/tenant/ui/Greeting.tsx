import { cn } from '@/lib/utils';

type GreetingProps = {
  kicker: string;
  titleBefore: string;
  titleEmphasis: string;
  titleAfter: string;
  className?: string;
};

export function Greeting({
  kicker,
  titleBefore,
  titleEmphasis,
  titleAfter,
  className,
}: GreetingProps) {
  return (
    <section data-slot="greeting" className={cn('px-4 pb-3 pt-4', className)}>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--ink-45)]">
        {kicker}
      </div>
      <h1 className="mt-1 text-[26px] font-bold leading-[1.15] tracking-[-0.015em] text-[color:var(--navy)]">
        {titleBefore} <em>{titleEmphasis}</em>
        {titleAfter}
      </h1>
    </section>
  );
}
