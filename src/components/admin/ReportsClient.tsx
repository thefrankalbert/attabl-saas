'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Download, FileText, Loader2, TrendingUp, Users, DollarSign, ShoppingBag, CreditCard, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { jsPDF } from 'jspdf';
import { cn } from '@/lib/utils';
import { format, subDays, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ReportsClientProps {
    tenantId: string;
}

type Period = '7d' | '30d' | '90d';

interface DailyStats {
    date: string;
    revenue: number;
    orders: number;
}

interface TopItem {
    id: string;
    name: string;
    quantity: number;
    revenue: number;
}

export default function ReportsClient({ tenantId }: ReportsClientProps) {
    const [period, setPeriod] = useState<Period>('7d');
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
    const [topItems, setTopItems] = useState<TopItem[]>([]);
    const [summary, setSummary] = useState({ revenue: 0, orders: 0, avgBasket: 0 });

    const { toast } = useToast();
    const supabase = createClient();

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
            const startDate = startOfDay(subDays(new Date(), days - 1)).toISOString();

            // 1. Fetch Orders
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .order('created_at', { ascending: true });

            if (ordersError) throw ordersError;

            // 2. Fetch Order Items for Top Items
            // Note: This might be heavy for large datasets, but fine for now.
            // Ideally we'd use a RPC or view for aggregation.
            const { data: items, error: itemsError } = await supabase
                .from('order_items')
                .select('*, menu_item:menu_items(name)')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate);

            if (itemsError) throw itemsError;

            // 3. Process Daily Stats
            const statsMap = new Map<string, DailyStats>();
            // Initialize all days
            for (let i = 0; i < days; i++) {
                const d = subDays(new Date(), days - 1 - i);
                const dateKey = format(d, 'yyyy-MM-dd');
                statsMap.set(dateKey, { date: dateKey, revenue: 0, orders: 0 });
            }

            let totalRev = 0;
            let totalOrd = 0;

            orders?.forEach(o => {
                const d = format(new Date(o.created_at), 'yyyy-MM-dd');
                const entry = statsMap.get(d);
                if (entry) {
                    entry.revenue += o.total_price;
                    entry.orders += 1;
                }
                totalRev += o.total_price;
                totalOrd += 1;
            });

            setDailyStats(Array.from(statsMap.values()));
            setSummary({
                revenue: totalRev,
                orders: totalOrd,
                avgBasket: totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0
            });

            // 4. Process Top Items
            const itemMap = new Map<string, TopItem>();
            items?.forEach((i: any) => {
                const id = i.menu_item_id || 'unknown';
                const name = i.menu_item?.name || i.name || 'Inconnu';
                const rawRev = i.price_at_order * i.quantity;

                const existing = itemMap.get(id);
                if (existing) {
                    existing.quantity += i.quantity;
                    existing.revenue += rawRev;
                } else {
                    itemMap.set(id, { id, name, quantity: i.quantity, revenue: rawRev });
                }
            });

            setTopItems(Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5));

        } catch (e) {
            console.error(e);
            toast({ title: "Erreur de chargement", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [supabase, tenantId, period, toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleExportPDF = () => {
        setExporting(true);
        try {
            const doc = new jsPDF();

            // Title
            doc.setFontSize(20);
            doc.text("Rapport d'activité", 20, 20);
            doc.setFontSize(10);
            doc.text(`Généré le ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 20, 28);
            doc.text(`Période : ${period === '7d' ? '7 derniers jours' : period === '30d' ? '30 derniers jours' : '90 derniers jours'}`, 20, 34);

            // Summary
            doc.setFillColor(245, 245, 245);
            doc.rect(20, 45, 170, 30, 'F');
            doc.setFontSize(12);
            doc.text(`Chiffre d'Affaires : ${summary.revenue.toLocaleString()} F`, 30, 65);
            doc.text(`Commandes : ${summary.orders}`, 100, 65);
            doc.text(`Panier Moyen : ${summary.avgBasket.toLocaleString()} F`, 150, 65);

            // Top Items
            doc.setFontSize(14);
            doc.text("Top 5 Produits", 20, 90);

            let y = 100;
            topItems.forEach((item, i) => {
                doc.setFontSize(12);
                doc.text(`${i + 1}. ${item.name}`, 20, y);
                doc.text(`${item.quantity} ventes`, 120, y);
                doc.text(`${item.revenue.toLocaleString()} F`, 160, y);
                y += 10;
            });

            doc.save(`rapport_${format(new Date(), 'yyyyMMdd')}.pdf`);
            toast({ title: "PDF téléchargé" });
        } catch (e) {
            toast({ title: "Erreur export PDF", variant: "destructive" });
        } finally {
            setExporting(false);
        }
    };

    const maxRevenue = useMemo(() => Math.max(...dailyStats.map(d => d.revenue), 1), [dailyStats]);

    if (loading) return <div className="p-12 text-center text-gray-500">Chargement des rapports...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Rapports & Statistiques</h1>
                    <p className="text-sm text-gray-500">Analysez la performance de votre restaurant.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Période" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7d">7 derniers jours</SelectItem>
                            <SelectItem value="30d">30 derniers jours</SelectItem>
                            <SelectItem value="90d">3 derniers mois</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={handleExportPDF} disabled={exporting}>
                        {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Exporter
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-6 bg-white border rounded-xl shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                            <DollarSign className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Chiffre d&apos;Affaires</p>
                            <p className="text-2xl font-bold text-gray-900">{summary.revenue.toLocaleString()} F</p>
                        </div>
                    </div>
                </div>
                <div className="p-6 bg-white border rounded-xl shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                            <ShoppingBag className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Volume Commandes</p>
                            <p className="text-2xl font-bold text-gray-900">{summary.orders}</p>
                        </div>
                    </div>
                </div>
                <div className="p-6 bg-white border rounded-xl shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                            <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Panier Moyen</p>
                            <p className="text-2xl font-bold text-gray-900">{summary.avgBasket.toLocaleString()} F</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chart & Top Items */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Section */}
                <div className="lg:col-span-2 bg-white border rounded-xl p-6 shadow-sm">
                    <h3 className="text-lg font-bold mb-6">Évolution des Revenus</h3>
                    <div className="h-64 flex items-end gap-2">
                        {dailyStats.map((day) => (
                            <div key={day.date} className="flex-1 flex flex-col items-center gap-2 group relative">
                                <div
                                    className="w-full bg-blue-500 rounded-t-sm transition-all hover:bg-blue-600 relative"
                                    style={{ height: `${(day.revenue / maxRevenue) * 100}%` }}
                                >
                                    <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-10 pointer-events-none">
                                        {day.revenue.toLocaleString()} F ({day.orders} cmds)
                                    </div>
                                </div>
                                <span className="text-[10px] text-gray-400 rotate-0 truncate w-full text-center">
                                    {format(new Date(day.date), 'dd/MM')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Items Section */}
                <div className="bg-white border rounded-xl p-6 shadow-sm">
                    <h3 className="text-lg font-bold mb-6">Top Produits</h3>
                    <div className="space-y-4">
                        {topItems.map((item, index) => (
                            <div key={item.id} className="flex items-center justify-between group">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gray-100 rounded-full text-xs font-bold text-gray-500">
                                        {index + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary transition-colors">{item.name}</p>
                                        <p className="text-xs text-gray-500">{item.quantity} ventes</p>
                                    </div>
                                </div>
                                <span className="text-sm font-bold text-gray-900 tabular-nums">
                                    {item.revenue.toLocaleString()} F
                                </span>
                            </div>
                        ))}
                        {topItems.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-8">Aucune donnée disponible</p>
                        )}
                    </div>

                    <Button variant="ghost" className="w-full mt-6 text-xs" onClick={() => toast({ title: "Voir plus bientôt disponible" })}>
                        Voir tout le classement <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
