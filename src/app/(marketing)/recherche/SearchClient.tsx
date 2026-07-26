'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowUpRight } from 'lucide-react';
import { Input } from '@/components/ui/input';

export type SearchEntry = { href: string; title: string; description: string };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function SearchClient({
  entries,
  initialQuery,
  placeholder,
  label,
  emptyLabel,
}: {
  entries: SearchEntry[];
  initialQuery: string;
  placeholder: string;
  label: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState(initialQuery);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return entries;
    return entries.filter((e) => normalize(`${e.title} ${e.description}`).includes(q));
  }, [entries, query]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-0 top-2.5 h-[30px] w-[30px] text-zinc-400" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          autoFocus
          className="h-auto rounded-none border-0 border-b-2 border-zinc-200 bg-transparent px-0 pb-4 pl-[46px] pt-1.5 text-[26px] font-medium tracking-[-0.02em] text-zinc-950 shadow-none focus-visible:border-zinc-900 focus-visible:ring-0 sm:text-[30px] dark:border-zinc-700 dark:text-zinc-50 dark:focus-visible:border-zinc-300"
        />
      </div>

      {results.length === 0 ? (
        <p className="mt-10 text-base text-zinc-500 dark:text-zinc-400">{emptyLabel}</p>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">
          {results.map((e) => (
            <li key={e.href}>
              <Link
                href={e.href}
                className="group flex items-start justify-between gap-4 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
              >
                <span className="min-w-0">
                  <span className="block text-[17px] font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
                    {e.title}
                  </span>
                  <span className="mt-1 block text-sm leading-[1.5] text-zinc-600 dark:text-zinc-400">
                    {e.description}
                  </span>
                </span>
                <ArrowUpRight className="mt-1 h-5 w-5 shrink-0 text-zinc-400 transition-colors group-hover:text-orange-600 dark:group-hover:text-orange-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
