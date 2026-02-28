import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-surface-tertiary', className)} {...props} />
  );
}

export { Skeleton };
