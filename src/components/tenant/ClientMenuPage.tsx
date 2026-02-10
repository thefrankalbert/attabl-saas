'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useToast } from '@/components/ui/use-toast';
import { Venue, Category, MenuItem, Ad, Tenant, Zone, Table } from '@/types/admin.types';
import AdsSlider from '@/components/tenant/AdsSlider';
import ClientShortcuts from '@/components/tenant/ClientShortcuts';
import BottomNav from '@/components/tenant/BottomNav';
import InstallPrompt from '@/components/tenant/InstallPrompt';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import CategoryNav from '@/components/tenant/CategoryNav';
import CartSummary from '@/components/tenant/CartSummary';
import TablePicker from '@/components/tenant/TablePicker';
import QRScanner, { QRScanResult } from '@/components/tenant/QRScanner';

interface ClientMenuPageProps {
    tenant: Tenant;
    venues: Venue[];
    categories: Category[];
    itemsByCategory: { id: string; name: string; items: MenuItem[] }[];
    ads: Ad[];
    zones: Zone[];
    tables: Table[];
}

export default function ClientMenuPage({
    tenant,
    venues,
    categories,
    itemsByCategory,
    ads,
    zones,
    tables
}: ClientMenuPageProps) {
    const { toast } = useToast();
    const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
    const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
    const [tableNumber, setTableNumber] = useState<string | null>(null);

    const handleTableSelect = (table: Table) => {
        setTableNumber(table.table_number);
        toast({
            title: "Table sélectionnée",
            description: `Vous êtes installé à la table ${table.table_number}`,
        });
        // Persist logic here if needed (context or localStorage)
        localStorage.setItem('attabl_table', table.table_number);
    };

    const handleQRScan = (result: QRScanResult) => {
        if (result.tableNumber) {
            // Try to match the scanned table number to a known table
            const matchedTable = tables.find(
                (t) =>
                    t.table_number === result.tableNumber ||
                    t.table_number === result.tableNumber?.toUpperCase() ||
                    t.display_name === result.tableNumber,
            );

            if (matchedTable) {
                handleTableSelect(matchedTable);
            } else {
                // Table number found in QR but not in our database — use it anyway
                setTableNumber(result.tableNumber);
                localStorage.setItem('attabl_table', result.tableNumber);
                toast({
                    title: 'Table identifiée',
                    description: `Table ${result.tableNumber} via QR code`,
                });
            }
        } else {
            toast({
                title: 'QR Code scanné',
                description: 'Aucun numéro de table détecté dans ce QR code.',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            {/* Header */}
            <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
                <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                    {tenant.logo_url ? (
                        <Image
                            src={tenant.logo_url}
                            alt={tenant.name}
                            width={120}
                            height={40}
                            className="h-10 w-auto object-contain"
                            priority
                        />
                    ) : (
                        <h1 className="text-xl font-bold" style={{ color: 'var(--tenant-primary)' }}>
                            {tenant.name}
                        </h1>
                    )}

                    {tableNumber && (
                        <div className="text-xs font-semibold px-2 py-1 bg-gray-100 rounded-lg text-gray-600">
                            Table {tableNumber}
                        </div>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">

                {/* Ads Banner */}
                {ads && ads.length > 0 && <AdsSlider ads={ads} />}

                {/* Quick Actions */}
                <ClientShortcuts
                    onSearchClick={() => setIsQRScannerOpen(true)} // Example: Search mapped to QR for now or Table Picker
                    primaryColor={tenant.primary_color || '#000000'}
                // Extend ClientShortcuts to accept onDineInClick -> Open Table Picker
                />

                {/* Temporary Button for Table Picker until ClientShortcuts is fully wired */}
                <div className="flex gap-2 mb-6 overflow-x-auto">
                    <button onClick={() => setIsTablePickerOpen(true)} className="px-4 py-2 bg-white border rounded-lg text-sm font-medium whitespace-nowrap">
                        Choisir ma table
                    </button>
                    <button onClick={() => setIsQRScannerOpen(true)} className="px-4 py-2 bg-white border rounded-lg text-sm font-medium whitespace-nowrap">
                        Scanner QR
                    </button>
                </div>

                {/* Venues Selector */}
                {venues && venues.length > 1 && (
                    <div className="mb-8">
                        <h2 className="text-lg font-bold mb-3 px-1">Nos espaces</h2>
                        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
                            {venues.map((venue: Venue) => (
                                <button
                                    key={venue.id}
                                    className="flex-shrink-0 px-5 py-3 bg-white rounded-xl shadow-sm border border-gray-100 whitespace-nowrap hover:shadow-md transition-all font-medium text-sm"
                                >
                                    {venue.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Category Navigation */}
                {categories && categories.length > 0 && <CategoryNav categories={categories} />}

                {/* Menu Items */}
                {itemsByCategory.length > 0 ? (
                    <div className="space-y-8 sm:space-y-10 mt-4 sm:mt-6">
                        {itemsByCategory.map(
                            (category) =>
                                category.items.length > 0 && (
                                    <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-32">
                                        <div className="flex items-center gap-3 mb-4 px-1">
                                            <h2 className="text-lg font-extrabold text-gray-900 uppercase tracking-tight">{category.name}</h2>
                                            <div className="h-px bg-gray-200 flex-1"></div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                                            {category.items.map((item: MenuItem) => (
                                                <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                                    <MenuItemCard
                                                        item={item}
                                                        restaurantId={tenant.id}
                                                        category={category.name}
                                                        accentColor={
                                                            tenant.primary_color
                                                                ? `text-[${tenant.primary_color}]`
                                                                : 'text-amber-600'
                                                        }
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                ),
                        )}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm mx-auto">
                            <p className="text-gray-500 font-medium">Aucun menu disponible pour le moment.</p>
                        </div>
                    </div>
                )}
            </main>

            {/* Cart Summary — floating FAB visible on all screen sizes */}
            <CartSummary />

            {/* Feature Modals */}
            <TablePicker
                isOpen={isTablePickerOpen}
                onClose={() => setIsTablePickerOpen(false)}
                onSelect={handleTableSelect}
                zones={zones}
                tables={tables}
            />

            <QRScanner
                isOpen={isQRScannerOpen}
                onClose={() => setIsQRScannerOpen(false)}
                onScan={handleQRScan}
                tables={tables}
            />

            {/* Install Prompt */}
            <InstallPrompt appName={tenant.name} logoUrl={tenant.logo_url} />

            {/* Bottom Nav */}
            <BottomNav
                tenantSlug={tenant.slug}
                primaryColor={tenant.primary_color || '#000000'}
                onSearchClick={() => { /* TODO */ }}
            />
        </div>
    );
}
