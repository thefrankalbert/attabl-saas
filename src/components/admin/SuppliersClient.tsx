'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Truck, Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useSuppliers } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DataTable, SortableHeader } from '@/components/admin/DataTable';
import { createSupplierService } from '@/services/supplier.service';
import type { ColumnDef } from '@tanstack/react-table';
import type { Supplier, CreateSupplierInput } from '@/types/supplier.types';

interface SuppliersClientProps {
  tenantId: string;
}

type ModalMode = 'add' | 'edit' | null;

export default function SuppliersClient({ tenantId }: SuppliersClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const { toast } = useToast();
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const supabase = createClient();
  const queryClient = useQueryClient();
  const supplierService = createSupplierService(supabase);

  // TanStack Query for suppliers
  const { data: suppliers = [], isLoading: loading } = useSuppliers(tenantId);

  const loadSuppliers = () => {
    queryClient.invalidateQueries({ queryKey: ['suppliers', tenantId] });
  };

  const filtered = suppliers.filter((s) => {
    if (filterActive === 'active' && !s.is_active) return false;
    if (filterActive === 'inactive' && s.is_active) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.contact_name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // TanStack Table column definitions
  const columns = useMemo<ColumnDef<Supplier, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableHeader column={column}>{t('name')}</SortableHeader>,
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-neutral-900">{row.original.name}</p>
            {row.original.contact_name && (
              <p className="text-xs text-neutral-400">{row.original.contact_name}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: () => t('email'),
        cell: ({ row }) => (
          <span className="text-neutral-600">{row.original.email || '\u2014'}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'phone',
        header: () => t('phone'),
        cell: ({ row }) => (
          <span className="text-neutral-600">{row.original.phone || '\u2014'}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'address',
        header: () => t('address'),
        cell: ({ row }) => (
          <span className="text-neutral-500 max-w-[200px] truncate block">
            {row.original.address || '\u2014'}
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
                  ? 'bg-green-100 text-green-700'
                  : 'bg-neutral-100 text-neutral-500',
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
                  className="text-xs text-red-600 hover:text-red-700"
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, deleteConfirm],
  );

  const resetForm = () => {
    setFormName('');
    setFormContact('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormNotes('');
    setSelectedSupplier(null);
  };

  const openAdd = () => {
    resetForm();
    setModalMode('add');
  };

  const openEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormName(supplier.name);
    setFormContact(supplier.contact_name || '');
    setFormPhone(supplier.phone || '');
    setFormEmail(supplier.email || '');
    setFormAddress(supplier.address || '');
    setFormNotes(supplier.notes || '');
    setModalMode('edit');
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: t('nameRequired'), variant: 'destructive' });
      return;
    }

    try {
      if (modalMode === 'add') {
        const input: CreateSupplierInput = {
          name: formName.trim(),
          contact_name: formContact.trim() || undefined,
          phone: formPhone.trim() || undefined,
          email: formEmail.trim() || undefined,
          address: formAddress.trim() || undefined,
          notes: formNotes.trim() || undefined,
        };
        await supplierService.createSupplier(tenantId, input);
        toast({ title: t('supplierAdded') });
      } else if (modalMode === 'edit' && selectedSupplier) {
        await supplierService.updateSupplier(selectedSupplier.id, tenantId, {
          name: formName.trim(),
          contact_name: formContact.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address: formAddress.trim() || null,
          notes: formNotes.trim() || null,
        });
        toast({ title: t('supplierModified') });
      }
      setModalMode(null);
      resetForm();
      loadSuppliers();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const handleToggleActive = async (supplier: Supplier) => {
    try {
      await supplierService.updateSupplier(supplier.id, tenantId, {
        is_active: !supplier.is_active,
      });
      toast({ title: supplier.is_active ? t('supplierDisabled') : t('supplierEnabled') });
      loadSuppliers();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const handleDelete = async (supplierId: string) => {
    try {
      await supplierService.deleteSupplier(supplierId, tenantId);
      toast({ title: t('supplierDeleted') });
      setDeleteConfirm(null);
      loadSuppliers();
    } catch {
      toast({ title: t('deleteError'), variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-neutral-500">{t('loadingSuppliers')}</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Truck className="w-6 h-6" />
            {t('title')}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {t('supplierCount', { count: suppliers.length })}
          </p>
        </div>
        <Button onClick={openAdd} variant="lime" className="gap-2">
          <Plus className="w-4 h-4" />
          {t('addSupplier')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <Input
            placeholder={t('searchPlaceholder')}
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map((status) => (
            <Button
              key={status}
              variant={filterActive === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterActive(status)}
              className="rounded-full"
            >
              {status === 'all'
                ? t('filterAll')
                : status === 'active'
                  ? t('filterActive')
                  : t('filterInactive')}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <DataTable columns={columns} data={filtered} emptyMessage={t('noSuppliersFound')} />

      {/* Modal — Add / Edit */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md animate-in zoom-in-95">
            <h3 className="font-bold text-lg mb-4">
              {modalMode === 'add' ? t('addSupplierTitle') : t('editSupplierTitle')}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1 block">
                  {t('nameLabel')}
                </label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1 block">
                  {t('contactPerson')}
                </label>
                <Input
                  value={formContact}
                  onChange={(e) => setFormContact(e.target.value)}
                  placeholder={t('contactPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-600 mb-1 block">
                    {t('phoneLabel')}
                  </label>
                  <Input
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+237..."
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 mb-1 block">
                    {t('emailLabel')}
                  </label>
                  <Input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="contact@..."
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1 block">
                  {t('addressLabel')}
                </label>
                <Input
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder={t('addressPlaceholder')}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1 block">
                  {t('notesLabel')}
                </label>
                <Input
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder={t('notesPlaceholder')}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="ghost"
                onClick={() => {
                  setModalMode(null);
                  resetForm();
                }}
              >
                {t('cancelAction')}
              </Button>
              <Button onClick={handleSave} variant="lime">
                {t('save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
