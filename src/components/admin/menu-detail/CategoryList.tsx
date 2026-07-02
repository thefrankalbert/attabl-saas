'use client';

import { Plus, Folder, FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListPagination } from '@/components/admin/ListPagination';
import type { MenuDetailVM } from './use-menu-detail';
import { CategoryCard } from './CategoryCard';

interface Props {
  vm: MenuDetailVM;
}

export function CategoryList({ vm }: Props) {
  const {
    t,
    categories,
    availableCategories,
    showAssignDropdown,
    setShowAssignDropdown,
    assigningCategory,
    handleAssignCategory,
    openNewCategoryModal,
    isRefreshing,
    effectiveCategoryPage,
    pageSize,
    totalCategories,
    handleCategoryPageChange,
  } = vm;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
      {/* Categories section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-app-text flex items-center gap-2">
            <Folder className="w-4 h-4 text-app-text-muted" />
            {t('categoriesCount', { count: categories.length })}
          </h2>
          <div className="flex items-center gap-2">
            {availableCategories.length > 0 && (
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                  disabled={assigningCategory}
                >
                  {assigningCategory ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FolderPlus className="w-4 h-4" />
                  )}
                  {t('assignExisting')}
                </Button>
                {showAssignDropdown && (
                  <>
                    {/* Backdrop to close dropdown */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowAssignDropdown(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-60 overflow-y-auto bg-app-card border border-app-border rounded-lg shadow-lg">
                      {availableCategories.map((cat) => (
                        <Button
                          key={cat.id}
                          variant="ghost"
                          onClick={() => handleAssignCategory(cat)}
                          className="w-full justify-start px-3 py-2 text-sm text-app-text hover:bg-app-bg rounded-none first:rounded-t-lg last:rounded-b-lg h-auto"
                        >
                          {cat.name}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <Button onClick={openNewCategoryModal} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> {t('newCategory')}
            </Button>
          </div>
        </div>

        {isRefreshing ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-16 bg-app-card rounded-xl border border-app-border animate-pulse"
              />
            ))}
          </div>
        ) : categories.length > 0 ? (
          <div className="space-y-4">
            {categories.map((cat) => (
              <CategoryCard key={cat.id} vm={vm} cat={cat} />
            ))}
            <ListPagination
              page={effectiveCategoryPage}
              pageSize={pageSize}
              totalCount={totalCategories}
              onPageChange={handleCategoryPageChange}
            />
          </div>
        ) : (
          <div className="bg-app-card rounded-xl border border-app-border p-12 text-center">
            <div className="w-14 h-14 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-4">
              <Folder className="w-7 h-7 text-app-text-muted" />
            </div>
            <h3 className="text-base font-bold text-app-text">{t('noCategoriesInMenu')}</h3>
            <p className="text-sm text-app-text-secondary mt-2">{t('noCategoriesInMenuDesc')}</p>
            <Button onClick={openNewCategoryModal} className="mt-4">
              {t('createCategory')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
