import { formatFCFA } from '@/lib/format/fcfa';
import { cn } from '@/lib/utils';

type PriceTagProps = {
  amount: number;
  className?: string;
  variant?: 'default' | 'display';
};

export function PriceTag({ amount, className, variant = 'default' }: PriceTagProps) {
  const isDisplay = variant === 'display';
  return (
    <span
      data-slot="price-tag"
      data-variant={variant}
      className={cn(
        'inline-block',
        isDisplay
          ? 'font-fraunces text-[14.5px] font-bold tracking-[-0.01em] text-[color:var(--navy)]'
          : 'font-bold tracking-tight text-[color:var(--gold)]',
        className,
      )}
    >
      {formatFCFA(amount)}
    </span>
  );
}
