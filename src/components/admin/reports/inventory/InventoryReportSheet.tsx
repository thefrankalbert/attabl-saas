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
      <div className="p-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-black/20 pb-4">
          <div className="flex items-center gap-3">
            {tenant.logoUrl && (
              <Image
                src={tenant.logoUrl}
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 rounded object-contain"
                unoptimized
              />
            )}
            <div>
              <p className="text-lg font-semibold text-black">{tenant.name}</p>
              {addressLine && <p className="text-xs text-black/60">{addressLine}</p>}
              {tenant.phone && <p className="text-xs text-black/60">{tenant.phone}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-base font-semibold text-black">{title}</p>
            <p className="text-xs text-black/60">{subtitle}</p>
          </div>
        </div>

        {/* Table */}
        <Table className="mt-6 text-xs">
          <TableHeader>
            <TableRow className="border-black/40 hover:bg-transparent">
              {table.columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={`h-auto py-1.5 font-semibold text-black ${alignClass(c.align)}`}
                >
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((row, ri) => (
              <TableRow key={ri} className="border-black/10 hover:bg-transparent">
                {row.map((cell, ci) => (
                  <TableCell
                    key={ci}
                    className={`py-1.5 text-black tabular-nums ${alignClass(
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
              <TableRow className="border-t-2 border-black/40 hover:bg-transparent">
                {table.totals.map((cell, ci) => (
                  <TableCell
                    key={ci}
                    className={`py-1.5 font-semibold text-black tabular-nums ${alignClass(
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
          <p className="mt-6 text-center text-sm text-black/50">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
