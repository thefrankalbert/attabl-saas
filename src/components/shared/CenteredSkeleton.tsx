import { cn } from '@/lib/utils';

/**
 * Theme-neutral centered page/section skeleton for one-off loading states
 * (checkout, order tracking, order-confirmed, cart section, invite...). Blocks
 * use `bg-current` + opacity so they inherit the surrounding text color and
 * read correctly on any background (dark checkout, white storefront, admin).
 * Replaces a bare spinner while a page or section resolves.
 */
export function CenteredSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-md animate-pulse space-y-4', className)}>
      <div className="mx-auto h-12 w-12 rounded-full bg-current opacity-10" />
      <div className="mx-auto h-4 w-2/3 rounded bg-current opacity-10" />
      <div className="mx-auto h-3 w-1/2 rounded bg-current opacity-[0.07]" />
      <div className="mt-2 h-24 w-full rounded-xl bg-current opacity-[0.06]" />
      <div className="h-11 w-full rounded-xl bg-current opacity-[0.06]" />
    </div>
  );
}
