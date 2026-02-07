'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    ShoppingBag,
    UtensilsCrossed,
    Settings,
    CreditCard,
    ChevronRight,
    QrCode,
    LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminSidebarProps {
    tenant: {
        name: string;
        slug: string;
        logo_url?: string;
        primary_color?: string;
    };
    adminUser?: {
        name?: string;
        role: string;
    };
    className?: string;
}

export function AdminSidebar({ tenant, adminUser, className }: AdminSidebarProps) {
    const pathname = usePathname();

    const navigation = [
        { name: 'Dashboard', href: `/admin`, icon: LayoutDashboard },
        { name: 'Commandes', href: `/admin/orders`, icon: ShoppingBag },
        { name: 'Menus', href: `/admin/menus`, icon: UtensilsCrossed },
        { name: 'QR Codes', href: `/admin/qr-codes`, icon: QrCode },
        { name: 'Abonnement', href: `/admin/subscription`, icon: CreditCard },
        { name: 'Paramètres', href: `/admin/settings`, icon: Settings },
    ];

    const roleLabels: Record<string, string> = {
        owner: 'Propriétaire',
        admin: 'Administrateur',
        manager: 'Manager',
        staff: 'Équipe'
    };

    return (
        <aside className={cn("fixed inset-y-0 left-0 w-64 bg-white shadow-lg z-40 flex flex-col", className)}>
            {/* Header */}
            <div className="p-6 border-b flex-shrink-0">
                <div className="flex items-center gap-3">
                    {tenant.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={tenant.logo_url}
                            alt={tenant.name}
                            className="w-10 h-10 rounded-lg object-contain"
                        />
                    ) : (
                        <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                            style={{ backgroundColor: tenant.primary_color || '#374151' }}
                        >
                            {tenant.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-bold text-gray-900 truncate">
                            {tenant.name}
                        </h2>
                        <p className="text-xs text-gray-500">
                            {adminUser ? roleLabels[adminUser.role] || adminUser.role : 'Admin'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navigation.map((item) => {
                    // Check if active (simple startsWith for sub-routes, exact for root)
                    const isActive = item.href === '/admin'
                        ? pathname === item.href || pathname === `/admin/`
                        : pathname?.startsWith(item.href);

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all group relative",
                                isActive
                                    ? "bg-gray-50 text-gray-900 font-medium"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            )}
                        >
                            {isActive && (
                                <div
                                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                                    style={{ backgroundColor: tenant.primary_color || '#000000' }}
                                />
                            )}

                            <item.icon
                                className={cn(
                                    "h-5 w-5 transition-colors",
                                    isActive ? "" : "text-gray-400 group-hover:text-gray-600"
                                )}
                                style={isActive ? { color: tenant.primary_color || '#000000' } : undefined}
                            />
                            <span>{item.name}</span>
                            {isActive && (
                                <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t bg-white flex-shrink-0">
                {/* User Info */}
                {adminUser && (
                    <div className="flex items-center gap-3 px-4 py-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                            <span className="text-xs font-bold text-gray-600">
                                {(adminUser.name || 'A').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                                {adminUser.name || 'Admin'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Logout */}
                <form action="/api/auth/signout" method="post">
                    <button
                        type="submit"
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
                    >
                        <LogOut className="h-4 w-4" />
                        Déconnexion
                    </button>
                </form>
            </div>
        </aside>
    );
}
