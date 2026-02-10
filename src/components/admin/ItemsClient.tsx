'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, Star, Check, X, Image as ImageIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AdminModal from '@/components/admin/AdminModal';
import { cn } from '@/lib/utils';
import type { MenuItem, Category } from '@/types/admin.types';

interface ItemsClientProps {
    tenantId: string;
    initialItems: MenuItem[];
    initialCategories: Category[];
}

export default function ItemsClient({ tenantId, initialItems, initialCategories }: ItemsClientProps) {
    const [items, setItems] = useState<MenuItem[]>(initialItems);
    const [categories] = useState<Category[]>(initialCategories);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
    const [saving, setSaving] = useState(false);
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterAvailable, setFilterAvailable] = useState('all');

    // Form state
    const [name, setName] = useState('');
    const [nameEn, setNameEn] = useState('');
    const [description, setDescription] = useState('');
    const [descriptionEn, setDescriptionEn] = useState('');
    const [price, setPrice] = useState(0);
    const [categoryId, setCategoryId] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [isAvailable, setIsAvailable] = useState(true);
    const [isFeatured, setIsFeatured] = useState(false);

    const { toast } = useToast();
    const supabase = createClient();

    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase.from('menu_items').select('*, categories(id, name)').eq('tenant_id', tenantId).order('name');
            if (filterCategory !== 'all') query = query.eq('category_id', filterCategory);
            if (filterAvailable !== 'all') query = query.eq('is_available', filterAvailable === 'available');
            const { data, error } = await query;
            if (error) throw error;
            const formatted: MenuItem[] = (data || []).map((item: Record<string, unknown>) => ({
                ...item,
                category: item.categories as Category,
            })) as MenuItem[];
            setItems(formatted);
        } catch {
            toast({ title: 'Erreur lors du chargement', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [supabase, tenantId, filterCategory, filterAvailable, toast]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const resetForm = () => {
        setName(''); setNameEn(''); setDescription(''); setDescriptionEn('');
        setPrice(0); setCategoryId(''); setImageUrl(''); setIsAvailable(true); setIsFeatured(false);
    };

    const openNewModal = () => {
        setEditingItem(null);
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (item: MenuItem) => {
        setEditingItem(item);
        setName(item.name); setNameEn(item.name_en || ''); setDescription(item.description || '');
        setDescriptionEn(item.description_en || ''); setPrice(item.price); setCategoryId(item.category_id);
        setImageUrl(item.image_url || ''); setIsAvailable(item.is_available); setIsFeatured(item.is_featured);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !categoryId) return;
        setSaving(true);
        try {
            const payload = {
                name: name.trim(), name_en: nameEn.trim() || null,
                description: description.trim() || null, description_en: descriptionEn.trim() || null,
                price, category_id: categoryId, image_url: imageUrl.trim() || null,
                is_available: isAvailable, is_featured: isFeatured, tenant_id: tenantId,
            };
            if (editingItem) {
                const { error } = await supabase.from('menu_items').update(payload).eq('id', editingItem.id);
                if (error) throw error;
                toast({ title: 'Plat mis à jour' });
            } else {
                const { error } = await supabase.from('menu_items').insert([payload]);
                if (error) throw error;
                toast({ title: 'Plat créé' });
            }
            setShowModal(false);
            loadItems();
        } catch {
            toast({ title: 'Erreur lors de la sauvegarde', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (item: MenuItem) => {
        if (!confirm(`Supprimer le plat "${item.name}" ?`)) return;
        try {
            const { error } = await supabase.from('menu_items').delete().eq('id', item.id);
            if (error) throw error;
            toast({ title: 'Plat supprimé' });
            loadItems();
        } catch {
            toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
        }
    };

    const toggleAvailable = async (item: MenuItem) => {
        try {
            const { error } = await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id);
            if (error) throw error;
            loadItems();
        } catch {
            toast({ title: 'Erreur', variant: 'destructive' });
        }
    };

    const toggleFeatured = async (item: MenuItem) => {
        try {
            const { error } = await supabase.from('menu_items').update({ is_featured: !item.is_featured }).eq('id', item.id);
            if (error) throw error;
            toast({ title: item.is_featured ? 'Retiré de la une' : 'Mis à la une' });
            loadItems();
        } catch {
            toast({ title: 'Erreur', variant: 'destructive' });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Plats & Articles</h1>
                    <p className="text-xs text-gray-500 mt-1">Gérez votre carte complète</p>
                </div>
                <Button onClick={openNewModal} size="sm" className="gap-2"><Plus className="w-4 h-4" /> Nouveau plat</Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 p-4 bg-white rounded-xl border border-gray-100">
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="h-9 w-full sm:w-[200px] text-xs"><SelectValue placeholder="Toutes les catégories" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Toutes les catégories</SelectItem>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={filterAvailable} onValueChange={setFilterAvailable}>
                    <SelectTrigger className="h-9 w-full sm:w-[150px] text-xs"><SelectValue placeholder="Tous" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Tous</SelectItem>
                        <SelectItem value="available">En stock</SelectItem>
                        <SelectItem value="unavailable">Épuisé</SelectItem>
                    </SelectContent>
                </Select>
                <span className="ml-auto text-xs text-gray-400 font-medium">{items.length} article{items.length > 1 ? 's' : ''}</span>
            </div>

            {/* Items List */}
            {loading ? (
                <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />)}</div>
            ) : items.length > 0 ? (
                <div className="space-y-2">
                    {items.map((item) => (
                        <div key={item.id} className="flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:bg-gray-50/50 transition-colors group">
                            {item.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-gray-100" />
                            ) : (
                                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-gray-300" /></div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{item.category?.name || 'Sans catégorie'}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-gray-900 text-sm tabular-nums">{item.price.toLocaleString()} <span className="text-xs text-gray-400">FCFA</span></p>
                            </div>
                            <button onClick={() => toggleAvailable(item)} className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-all', item.is_available ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-gray-100 text-gray-500 border-gray-200')}>
                                {item.is_available ? <><Check className="w-3 h-3 inline mr-1" />Stock</> : <><X className="w-3 h-3 inline mr-1" />Épuisé</>}
                            </button>
                            <button onClick={() => toggleFeatured(item)} className={cn('p-2 rounded-lg transition-all', item.is_featured ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:text-amber-500 hover:bg-gray-50')}>
                                <Star className={cn('w-4 h-4', item.is_featured && 'fill-current')} />
                            </button>
                            <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                <Button variant="outline" size="sm" onClick={() => openEditModal(item)} className="text-xs h-8">Modifier</Button>
                                <Button variant="outline" size="sm" onClick={() => handleDelete(item)} className="text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50">Supprimer</Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><ImageIcon className="w-8 h-8 text-gray-400" /></div>
                    <h3 className="text-lg font-bold text-gray-900">Aucun plat</h3>
                    <p className="text-sm text-gray-500 mt-2">Ajoutez des plats à votre carte</p>
                    <Button onClick={openNewModal} className="mt-6">Ajouter un plat</Button>
                </div>
            )}

            {/* Modal */}
            <AdminModal isOpen={showModal} onClose={() => setShowModal(false)} title={editingItem ? 'Modifier le plat' : 'Nouveau plat'} size="lg">
                <form onSubmit={handleSubmit} className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Nom (FR) *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Poulet Yassa" required /></div>
                        <div className="space-y-2"><Label>Nom (EN)</Label><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Ex: Yassa Chicken" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Description (FR)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description du plat..." rows={3} /></div>
                        <div className="space-y-2"><Label>Description (EN)</Label><Textarea value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} placeholder="Dish description..." rows={3} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Prix (FCFA) *</Label><Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} min={0} required /></div>
                        <div className="space-y-2">
                            <Label>Catégorie *</Label>
                            <Select value={categoryId} onValueChange={setCategoryId}>
                                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2"><Label>URL Image</Label><Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." /></div>
                    <div className="flex items-center gap-6 pt-2">
                        <div className="flex items-center gap-2"><Switch checked={isAvailable} onCheckedChange={setIsAvailable} /><Label className="text-sm">Disponible</Label></div>
                        <div className="flex items-center gap-2"><Switch checked={isFeatured} onCheckedChange={setIsFeatured} /><Label className="text-sm">À la une</Label></div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Annuler</Button>
                        <Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editingItem ? 'Mettre à jour' : 'Créer'}</Button>
                    </div>
                </form>
            </AdminModal>
        </div>
    );
}
