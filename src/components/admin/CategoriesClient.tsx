'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, Folder, GripVertical, Utensils } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AdminModal from '@/components/admin/AdminModal';
import { cn } from '@/lib/utils';
import type { Category } from '@/types/admin.types';

interface CategoriesClientProps {
    tenantId: string;
    initialCategories: Category[];
}

type CategoryWithCount = Category & { items_count?: number };

export default function CategoriesClient({ tenantId, initialCategories }: CategoriesClientProps) {
    const [categories, setCategories] = useState<CategoryWithCount[]>(initialCategories as CategoryWithCount[]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState<CategoryWithCount | null>(null);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [nameEn, setNameEn] = useState('');
    const [displayOrder, setDisplayOrder] = useState(0);
    const { toast } = useToast();
    const supabase = createClient();

    const loadCategories = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('categories')
                .select('*, menu_items(id)')
                .eq('tenant_id', tenantId)
                .order('display_order', { ascending: true });
            if (error) throw error;
            const formatted = (data || []).map((cat: Record<string, unknown>) => ({
                ...cat,
                items_count: (cat.menu_items as unknown[])?.length || 0,
            })) as CategoryWithCount[];
            setCategories(formatted);
        } catch {
            toast({ title: 'Erreur lors du chargement', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [supabase, tenantId, toast]);

    useEffect(() => {
        if (initialCategories.length === 0) loadCategories();
    }, [initialCategories, loadCategories]);

    const openNewModal = () => {
        setEditingCategory(null);
        setName('');
        setNameEn('');
        setDisplayOrder(categories.length);
        setShowModal(true);
    };

    const openEditModal = (cat: CategoryWithCount) => {
        setEditingCategory(cat);
        setName(cat.name);
        setNameEn(cat.name_en || '');
        setDisplayOrder(cat.display_order || 0);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        try {
            const payload = {
                name: name.trim(),
                name_en: nameEn.trim() || null,
                display_order: displayOrder,
                tenant_id: tenantId,
            };
            if (editingCategory) {
                const { error } = await supabase.from('categories').update(payload).eq('id', editingCategory.id);
                if (error) throw error;
                toast({ title: 'Catégorie mise à jour' });
            } else {
                const { error } = await supabase.from('categories').insert([payload]);
                if (error) throw error;
                toast({ title: 'Catégorie créée' });
            }
            setShowModal(false);
            loadCategories();
        } catch {
            toast({ title: 'Erreur lors de la sauvegarde', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (cat: CategoryWithCount) => {
        if (cat.items_count && cat.items_count > 0) {
            toast({ title: `Cette catégorie contient ${cat.items_count} plat(s). Supprimez-les d'abord.`, variant: 'destructive' });
            return;
        }
        if (!confirm(`Supprimer la catégorie "${cat.name}" ?`)) return;
        try {
            const { error } = await supabase.from('categories').delete().eq('id', cat.id);
            if (error) throw error;
            toast({ title: 'Catégorie supprimée' });
            loadCategories();
        } catch {
            toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Catégories</h1>
                    <p className="text-xs text-gray-500 mt-1">Structurez vos menus par catégories</p>
                </div>
                <Button onClick={openNewModal} size="sm" className="gap-2">
                    <Plus className="w-4 h-4" /> Nouvelle catégorie
                </Button>
            </div>

            {/* Counter */}
            <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-gray-100">
                <Folder className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500 font-medium">{categories.length} catégorie{categories.length > 1 ? 's' : ''}</span>
            </div>

            {/* List */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-white rounded-xl border border-gray-100 animate-pulse" />
                    ))}
                </div>
            ) : categories.length > 0 ? (
                <div className="space-y-2">
                    {categories.map((cat) => (
                        <div key={cat.id} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:bg-gray-50/50 transition-colors group">
                            <GripVertical className="w-4 h-4 text-gray-300" />
                            <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
                                <Folder className="w-4 h-4 text-gray-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 text-sm">{cat.name}</p>
                                {cat.name_en && <p className="text-xs text-gray-400">{cat.name_en}</p>}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <Utensils className="w-3.5 h-3.5" />
                                <span className="font-medium">{cat.items_count || 0} plats</span>
                            </div>
                            <div className="flex items-center gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                <Button variant="outline" size="sm" onClick={() => openEditModal(cat)} className="text-xs h-8">Modifier</Button>
                                <Button variant="outline" size="sm" onClick={() => handleDelete(cat)} className="text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50">Supprimer</Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Folder className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Aucune catégorie</h3>
                    <p className="text-sm text-gray-500 mt-2">Créez des catégories pour organiser vos plats</p>
                    <Button onClick={openNewModal} className="mt-6">Créer une catégorie</Button>
                </div>
            )}

            {/* Modal */}
            <AdminModal isOpen={showModal} onClose={() => setShowModal(false)} title={editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}>
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="cat-name">Nom (FR) *</Label>
                            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Entrées" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cat-name-en">Nom (EN)</Label>
                            <Input id="cat-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Ex: Starters" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="cat-order">Ordre d&apos;affichage</Label>
                        <Input id="cat-order" type="number" value={displayOrder} onChange={(e) => setDisplayOrder(Number(e.target.value))} min={0} />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Annuler</Button>
                        <Button type="submit" disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {editingCategory ? 'Mettre à jour' : 'Créer'}
                        </Button>
                    </div>
                </form>
            </AdminModal>
        </div>
    );
}
