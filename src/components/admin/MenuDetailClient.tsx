'use client';

import AdminModal from '@/components/admin/AdminModal';
import ItemModifierEditor from '@/components/admin/ItemModifierEditor';
import { useMenuDetail, type MenuDetailClientProps } from './menu-detail/use-menu-detail';
import { MenuDetailHeader } from './menu-detail/MenuDetailHeader';
import { CategoryList } from './menu-detail/CategoryList';
import { CategoryFormModal } from './menu-detail/CategoryFormModal';
import { ItemEditModal } from './menu-detail/ItemEditModal';
import { DeleteCategoryDialog } from './menu-detail/DeleteCategoryDialog';

export default function MenuDetailClient(props: MenuDetailClientProps) {
  const vm = useMenuDetail(props);
  const { tenantId, t, editingModifiersItem, setEditingModifiersItem, refreshList } = vm;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Breadcrumb + toggle - compact, no redundancy */}
      <MenuDetailHeader vm={vm} />

      <CategoryList vm={vm} />

      {/* Category Modal */}
      <CategoryFormModal vm={vm} />

      {/* Item Edit Modal */}
      <ItemEditModal vm={vm} />

      {/* Modifier Editor Modal */}
      <AdminModal
        isOpen={!!editingModifiersItem}
        onClose={() => setEditingModifiersItem(null)}
        title={t('modifiersTitle')}
      >
        {editingModifiersItem && (
          <ItemModifierEditor
            tenantId={tenantId}
            menuItemId={editingModifiersItem.id}
            menuItemName={editingModifiersItem.name}
            modifiers={editingModifiersItem.modifiers || []}
            onUpdate={refreshList}
            onClose={() => setEditingModifiersItem(null)}
          />
        )}
      </AdminModal>

      {/* Delete confirmation dialog */}
      <DeleteCategoryDialog vm={vm} />
    </div>
  );
}
