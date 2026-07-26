import { cn } from '@/lib/utils';

/** Reusable browser-chrome frame (3 dots + optional label) wrapping a product screenshot. */
export function BrowserFrame({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_30px_60px_-30px_rgba(9,9,11,0.24)] dark:border-zinc-800 dark:bg-zinc-900',
        className,
      )}
    >
      <div className="flex h-[38px] items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-3.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        </div>
        {label && (
          <span className="ml-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        )}
      </div>
      {children}
    </div>
  );
}
