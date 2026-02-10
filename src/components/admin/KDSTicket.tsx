'use client';

import { useEffect, useState } from 'react';
import { Timer, Flame, AlertTriangle, ArrowRight, User, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order, OrderStatus } from '@/types/admin.types';

interface KDSTicketProps {
    order: Order;
    onStatusChange: (id: string, status: OrderStatus) => void;
    isMock?: boolean;
}

export default function KDSTicket({ order, onStatusChange, isMock = false }: KDSTicketProps) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const calculate = () => {
            const diff = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);
            setElapsed(diff);
        };
        calculate();
        const interval = setInterval(calculate, 1000);
        return () => clearInterval(interval);
    }, [order.created_at]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const minutes = Math.floor(elapsed / 60);
    const isLate = minutes >= 20;
    const isWarning = minutes >= 10 && minutes < 20;

    const statusConfig = {
        pending: { bg: 'bg-amber-500', label: 'En Attente', borderColor: 'border-amber-500/50' },
        preparing: { bg: 'bg-blue-500', label: 'En Préparation', borderColor: 'border-blue-500/50' },
        ready: { bg: 'bg-emerald-500', label: 'Prêt à Servir', borderColor: 'border-emerald-500/50' },
        delivered: { bg: 'bg-gray-500', label: 'Servi', borderColor: 'border-gray-500/50' },
        cancelled: { bg: 'bg-red-500', label: 'Annulé', borderColor: 'border-red-500/50' },
    };

    const currentConfig = statusConfig[order.status] || statusConfig.pending;
    const timerColor = isLate
        ? 'bg-red-500 text-white'
        : isWarning
            ? 'bg-amber-500 text-white'
            : 'bg-emerald-500/20 text-emerald-400';

    const nextStatusMap: Record<string, OrderStatus> = {
        pending: 'preparing',
        preparing: 'ready',
        ready: 'delivered',
    };

    const actionLabel: Record<string, string> = {
        pending: 'DÉMARRER',
        preparing: 'TERMINER',
        ready: 'SERVIR',
    };

    const actionColor: Record<string, string> = {
        pending: 'bg-amber-500 hover:bg-amber-600',
        preparing: 'bg-blue-500 hover:bg-blue-600',
        ready: 'bg-emerald-500 hover:bg-emerald-600',
    };

    const handleAction = () => {
        if (isMock) return;
        const nextStatus = nextStatusMap[order.status];
        if (nextStatus) onStatusChange(order.id, nextStatus);
    };

    return (
        <div
            className={cn(
                'flex flex-col rounded-xl overflow-hidden border-2 transition-all duration-300 bg-slate-900',
                currentConfig.borderColor,
                isLate && 'animate-pulse border-red-500',
                isMock && 'opacity-90'
            )}
        >
            {/* Status Bar */}
            <div className={cn('h-1.5 w-full', currentConfig.bg)} />

            {/* Header */}
            <div className="p-3 border-b border-white/5">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                            <span className="font-mono text-xl font-black text-white">{order.table_number}</span>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Table</p>
                            <div className="flex items-center gap-1.5">
                                <span className="font-bold text-white text-lg">#{order.table_number}</span>
                                {/* Server name could go here if added to schema */}
                            </div>
                        </div>
                    </div>

                    <div
                        className={cn(
                            'px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-all min-w-[80px] justify-center',
                            timerColor,
                            isLate && 'animate-pulse'
                        )}
                    >
                        {isLate ? <Flame className="w-3.5 h-3.5" /> : <Timer className="w-3.5 h-3.5" />}
                        <span className="font-mono text-sm font-black tabular-nums">{formatTime(elapsed)}</span>
                    </div>
                </div>
            </div>

            {/* Items List */}
            <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[220px] bg-slate-900/50 custom-scrollbar">
                {(order.items || []).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-2 rounded-lg bg-white/5 border border-white/5">
                        <div className="w-6 h-6 flex-shrink-0 rounded bg-slate-800 border border-slate-700 flex items-center justify-center">
                            <span className="font-mono text-xs font-black text-white">{item.quantity}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white leading-tight">{item.name}</p>
                            {item.notes && (
                                <div className="mt-1.5 flex items-start gap-1.5 text-amber-400">
                                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                    <p className="text-[10px] font-bold uppercase tracking-wide leading-tight">{item.notes}</p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Action Button */}
            {actionLabel[order.status] && (
                <button
                    onClick={handleAction}
                    className={cn(
                        'w-full py-3 font-black text-[10px] uppercase tracking-widest text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2',
                        actionColor[order.status]
                    )}
                >
                    <span>{actionLabel[order.status]}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}
