'use client';

import Image from 'next/image';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import type { ReportTable } from '@/lib/reports/inventory-report';

export interface ReportTenant {
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
}

interface InventoryReportSheetProps {
  tenant: ReportTenant;
  title: string;
  subtitle: string;
  table: ReportTable;
  orientation: 'portrait' | 'landscape';
}

/**
 * On-screen + print-ready inventory report sheet. Restaurant header (logo, name,
 * address, phone) + generated subtitle, then a clean bordered table. Rendered in
 * fixed black-on-white so it prints identically; the parent scopes @media print
 * to #report-sheet so only this sheet prints (no admin shell).
 */
export function InventoryReportSheet({
  tenant,
  title,
  subtitle,
  table,
  orientation,
}: InventoryReportSheetProps) {
  const addressLine = [tenant.address, tenant.city, tenant.country].filter(Boolean).join(', ');
  const alignClass = (a: 'left' | 'right') => (a === 'right' ? 'text-right' : 'text-left');

  return (
    <div
      id="report-sheet"
      className="mx-auto bg-white text-black"
      style={{ width: orientation === 'landscape' ? '297mm' : '210mm', maxWidth: '100%' }}
    >
      <div className="p-10">
        {/* Header: restaurant identity left, document meta right */}
        <div className="flex items-start justify-between gap-6 border-b border-zinc-200 pb-5">
          <div className="flex items-center gap-3">
            {tenant.logoUrl && (
              <Image
                src={tenant.logoUrl}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 rounded object-contain"
                unoptimized
              />
            )}
            <div>
              <p className="text-[17px] font-bold tracking-tight text-zinc-900">{tenant.name}</p>
              {addressLine && <p className="mt-0.5 text-[11px] text-zinc-500">{addressLine}</p>}
              {tenant.phone && <p className="text-[11px] text-zinc-500">{tenant.phone}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Rapport de stock
            </p>
            <p className="mt-1 text-xl font-bold tracking-tight text-zinc-900">{title}</p>
            <p className="mt-1 text-[11px] text-zinc-500">{subtitle}</p>
          </div>
        </div>

        {/* Table */}
        <Table className="mt-7 text-xs">
          <TableHeader>
            <TableRow className="border-zinc-200 hover:bg-transparent">
              {table.columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={`h-auto py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400 ${alignClass(c.align)}`}
                >
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((row, ri) => (
              <TableRow key={ri} className="border-zinc-100 hover:bg-transparent">
                {row.map((cell, ci) => (
                  <TableCell
                    key={ci}
                    className={`py-2 text-zinc-700 tabular-nums ${alignClass(
                      table.columns[ci]?.align ?? 'left',
                    )}`}
                  >
                    {cell || ' '}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          {table.totals && (
            <TableFooter className="bg-transparent">
              <TableRow className="border-t-2 border-zinc-900 hover:bg-transparent">
                {table.totals.map((cell, ci) => (
                  <TableCell
                    key={ci}
                    className={`py-2 font-bold text-zinc-900 tabular-nums ${alignClass(
                      table.columns[ci]?.align ?? 'left',
                    )}`}
                  >
                    {cell || ' '}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>

        {table.rows.length === 0 && (
          <p className="mt-8 text-center text-sm text-zinc-400">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
