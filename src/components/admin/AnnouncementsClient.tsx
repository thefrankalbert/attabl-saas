'use client';

import { useState } from 'react';
import { Plus, Loader2, Trash2, Megaphone, Calendar, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import AdminModal from '@/components/admin/AdminModal';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Announcement } from '@/types/admin.types';

interface AnnouncementsClientProps {
    tenantId: string;
    initialAnnouncements: Announcement[];
}

export default function AnnouncementsClient({ tenantId, initialAnnouncements }: AnnouncementsClientProps) {
    const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState('');
    const [isActive, setIsActive] = useState(true);

    const { toast } = useToast();
    const supabase = createClient();

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setStartDate(new Date().toISOString().split('T')[0]);
        setEndDate('');
        setIsActive(true);
    };

    const handleSave = async () => {
        if (!title || !startDate) {
            toast({ title: "Titre et date de début requis", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            const { data: newAnnouncement, error } = await supabase
                .from('announcements')
                .insert({
                    tenant_id: tenantId,
                    title,
                    description: description || null,
                    start_date: new Date(startDate).toISOString(),
                    end_date: endDate ? new Date(endDate).toISOString() : null,
                    is_active: isActive
                })
                .select()
                .single();

            if (error) throw error;

            setAnnouncements(prev => [newAnnouncement as Announcement, ...prev]);
            toast({ title: "Annonce créée !" });
            setIsModalOpen(false);
            resetForm();
        } catch (e: any) {
            console.error(e);
            toast({ title: "Erreur", description: e.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Supprimer cette annonce ?")) return;

        try {
            await supabase.from('announcements').delete().eq('id', id);
            setAnnouncements(prev => prev.filter(a => a.id !== id));
            toast({ title: "Annonce supprimée" });
        } catch {
            toast({ title: "Erreur", variant: "destructive" });
        }
    };

    const toggleActive = async (announcement: Announcement) => {
        try {
            const { data } = await supabase
                .from('announcements')
                .update({ is_active: !announcement.is_active })
                .eq('id', announcement.id)
                .select()
                .single();

            if (data) {
                setAnnouncements(prev => prev.map(a => a.id === announcement.id ? data as Announcement : a));
                toast({ title: !announcement.is_active ? "Activée" : "Désactivée" });
            }
        } catch {
            toast({ title: "Erreur", variant: "destructive" });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Annonces</h1>
                    <p className="text-sm text-gray-500">Gérez les popups et messages d&apos;information pour vos clients.</p>
                </div>
                <Button onClick={() => { resetForm(); setIsModalOpen(true); }} className="gap-2">
                    <Plus className="w-4 h-4" /> Nouvelle Annonce
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {announcements.map(ann => (
                    <div key={ann.id} className="group bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
                        <div className="flex justify-between items-start mb-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${ann.is_active ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                <Megaphone className="w-5 h-5" />
                            </div>
                            <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${ann.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                {ann.is_active ? 'Active' : 'Inactive'}
                            </div>
                        </div>

                        <h3 className="font-bold text-gray-900 mb-2 line-clamp-1">{ann.title}</h3>
                        {ann.description && <p className="text-sm text-gray-500 line-clamp-2 mb-4 flex-1">{ann.description}</p>}

                        <div className="mt-auto space-y-4">
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                                <Calendar className="w-3 h-3" />
                                <span>Du {format(new Date(ann.start_date), 'dd MMM yyyy', { locale: fr })}</span>
                                {ann.end_date && <span>au {format(new Date(ann.end_date), 'dd MMM yyyy', { locale: fr })}</span>}
                            </div>

                            <div className="flex gap-2 border-t pt-4">
                                <Button variant="outline" size="sm" className="flex-1" onClick={() => toggleActive(ann)}>
                                    {ann.is_active ? <EyeOff className="w-3 h-3 mr-2" /> : <Eye className="w-3 h-3 mr-2" />}
                                    {ann.is_active ? 'Masquer' : 'Afficher'}
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(ann.id)}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
                {announcements.length === 0 && (
                    <div className="col-span-full py-12 text-center bg-gray-50 border border-dashed border-gray-200 rounded-xl">
                        <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-sm font-semibold text-gray-900">Aucune annonce</h3>
                        <p className="text-xs text-gray-500 mt-1">Publiez une information importante pour vos clients.</p>
                    </div>
                )}
            </div>

            <AdminModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Nouvelle Annonce"
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Titre *</Label>
                        <Input placeholder="Ex: Fermeture exceptionnelle..." value={title} onChange={e => setTitle(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea placeholder="Détails de l'annonce..." value={description} onChange={e => setDescription(e.target.value)} className="min-h-[100px]" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Date de début *</Label>
                            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Date de fin (optionnel)</Label>
                            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <Switch checked={isActive} onCheckedChange={setIsActive} id="active-mode" />
                        <Label htmlFor="active-mode">Activer immédiatement</Label>
                    </div>

                    <div className="pt-4 flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Annuler</Button>
                        <Button onClick={handleSave} disabled={loading}>
                            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Publier
                        </Button>
                    </div>
                </div>
            </AdminModal>
        </div>
    );
}
