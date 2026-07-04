'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SortableHeader } from '@/components/admin/ResponsiveDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { Supplier } from '@/types/supplier.types';

interface UseSupplierColumnsArgs {
  openEdit: (supplier: Supplier) => void;
  handleToggleActive: (supplier: Supplier) => void;
  handleDelete: (supplierId: string) => void;
  deleteConfirm: string | null;
  setDeleteConfirm: (id: string | null) => void;
}

// TanStack Table column definitions for the suppliers table.
export function useSupplierColumns({
  openEdit,
  handleToggleActive,
  handleDelete,
  deleteConfirm,
  setDeleteConfirm,
}: UseSupplierColumnsArgs): ColumnDef<Supplier, unknown>[] {
  const t = useTranslations('suppliers');

  return useMemo<ColumnDef<Supplier, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableHeader column={column}>{t('name')}</SortableHeader>,
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-app-text">{row.original.name}</p>
            {row.original.contact_name && (
              <p className="text-xs text-app-text-secondary">{row.original.contact_name}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: () => t('email'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary">{row.original.email || '-'}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'phone',
        header: () => t('phone'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary">{row.original.phone || '-'}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'address',
        header: () => t('address'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary max-w-48 truncate block">
            {row.original.address || '-'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => <span className="w-full text-center block">{t('filterActive')}</span>,
        cell: ({ row }) => (
          <div className="text-center">
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                row.original.is_active
                  ? 'bg-status-success-bg text-status-success'
                  : 'bg-app-bg text-app-text-secondary',
              )}
            >
              {row.original.is_active ? t('active') : t('inactive')}
            </span>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <span className="w-full text-right block">{t('edit')}</span>,
        cell: ({ row }) => {
          const supplier = row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(supplier)}
                className="gap-1 text-xs"
              >
                <Pencil className="w-3 h-3" />
                {t('edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleActive(supplier)}
                className="text-xs"
              >
                {supplier.is_active ? t('disable') : t('enable')}
              </Button>
              {deleteConfirm === supplier.id ? (
                <div className="flex gap-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(supplier.id)}
                    className="text-xs"
                  >
                    {t('confirmAction')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm(null)}
                    className="text-xs"
                  >
                    {t('cancelAction')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirm(supplier.id)}
                  title="Supprimer"
                  className="text-xs text-status-error hover:text-status-error"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: openEdit/handleToggleActive/handleDelete are stable action handlers; the reactive values (t, deleteConfirm) are listed, and adding the handler identities would rebuild columns each render with no behavior change (2026-06-18)
    [t, deleteConfirm],
  );
}
