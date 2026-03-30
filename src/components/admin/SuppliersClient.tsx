'use client';

import { useState, useMemo } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations } from 'next-intl';
import { Truck, Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useSuppliers } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ResponsiveDataTable, SortableHeader } from '@/components/admin/ResponsiveDataTable';
import AdminModal from '@/components/admin/AdminModal';
import { createSupplierService } from '@/services/supplier.service';
import type { ColumnDef } from '@tanstack/react-table';
import RoleGuard from '@/components/admin/RoleGuard';
import type { Supplier, CreateSupplierInput } from '@/types/supplier.types';

interface SuppliersClientProps {
  tenantId: string;
}

type ModalMode = 'add' | 'edit' | null;

export default function SuppliersClient({ tenantId }: SuppliersClientProps) {
  const [searchQuery, setSearchQuery] = useSessionState('suppliers:searchQuery', '');
  const [filterActive, setFilterActive] = useSessionState<'all' | 'active' | 'inactive'>(
    'suppliers:filterActive',
    'all',
  );

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
          <span className="text-app-text-secondary">{row.original.email || '\u2014'}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'phone',
        header: () => t('phone'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary">{row.original.phone || '\u2014'}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'address',
        header: () => t('address'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary max-w-[200px] truncate block">
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

  return (
    <RoleGuard permission="canManageStocks">
      <div className="h-full flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-app-text-secondary">
            {t('loadingSuppliers')}
          </div>
        ) : (
          <>
            <div className="shrink-0 space-y-3">
              {/* Header — single line on desktop */}
              <div className="flex flex-col @lg:flex-row @lg:items-center gap-3">
                <h1 className="text-2xl font-bold text-app-text flex items-center gap-2 shrink-0">
                  <Truck className="w-6 h-6" />
                  {t('title')}
                  <span className="text-base font-normal text-app-text-secondary">
                    ({suppliers.length})
                  </span>
                </h1>

                <div className="relative w-full @lg:w-56 @xl:w-64 shrink-0">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
                  <Input
                    data-search-input
                    placeholder={t('searchPlaceholder')}
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 shrink-0">
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

                <Button onClick={openAdd} variant="default" className="gap-2 lg:ml-auto shrink-0">
                  <Plus className="w-4 h-4" />
                  {t('addSupplier')}
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
              {/* Table / Cards */}
              <ResponsiveDataTable
                columns={columns}
                data={filtered}
                emptyMessage={t('noSuppliersFound')}
                storageKey="suppliers"
                mobileConfig={{
                  renderCard: (supplier) => (
                    <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3">
                      {/* Row 1: Name + Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-app-text break-words">{supplier.name}</p>
                          {supplier.contact_name && (
                            <p className="text-xs text-app-text-secondary">
                              {supplier.contact_name}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium shrink-0',
                            supplier.is_active
                              ? 'bg-status-success-bg text-status-success'
                              : 'bg-app-bg text-app-text-secondary',
                          )}
                        >
                          {supplier.is_active ? t('active') : t('inactive')}
                        </span>
                      </div>

                      {/* Row 2: Contact info */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-app-text-secondary">
                        {supplier.phone && <span>{supplier.phone}</span>}
                        {supplier.email && <span className="break-all">{supplier.email}</span>}
                      </div>

                      {/* Row 3: Actions */}
                      <div className="flex justify-end gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(supplier)}
                          className="gap-1 text-xs min-h-[44px]"
                        >
                          <Pencil className="w-3 h-3" />
                          {t('edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(supplier)}
                          className="text-xs min-h-[44px]"
                        >
                          {supplier.is_active ? t('disable') : t('enable')}
                        </Button>
                      </div>
                    </div>
                  ),
                }}
              />
            </div>

            {/* Modal — Add / Edit */}
            <AdminModal
              isOpen={modalMode !== null}
              onClose={() => {
                setModalMode(null);
                resetForm();
              }}
              title={modalMode === 'add' ? t('addSupplierTitle') : t('editSupplierTitle')}
              size="lg"
            >
              <div className="space-y-4 pt-4">
                <div>
                  <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                    {t('nameLabel')}
                  </Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('namePlaceholder')}
                    autoFocus
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                    {t('contactPerson')}
                  </Label>
                  <Input
                    value={formContact}
                    onChange={(e) => setFormContact(e.target.value)}
                    placeholder={t('contactPlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                      {t('phoneLabel')}
                    </Label>
                    <Input
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="+237..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                      {t('emailLabel')}
                    </Label>
                    <Input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="contact@..."
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                    {t('addressLabel')}
                  </Label>
                  <Input
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder={t('addressPlaceholder')}
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                    {t('notesLabel')}
                  </Label>
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
                <Button onClick={handleSave} variant="default">
                  {t('save')}
                </Button>
              </div>
            </AdminModal>
          </>
        )}
      </div>
    </RoleGuard>
  );
}
