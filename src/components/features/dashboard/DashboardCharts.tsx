'use client';

import Link from 'next/link';
import { TrendingUp, ArrowRight, ChefHat, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

// ─── Types ─────────────────────────────────────────────────

interface RevenueChartDataPoint {
  day: string;
  orders: number;
}

interface DashboardChartsProps {
  revenueChartData: RevenueChartDataPoint[];
  adminBase: string;
  t: (key: string) => string;
}

// ─── Component ─────────────────────────────────────────────

export default function DashboardCharts({ revenueChartData, adminBase, t }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-h-0">
      {/* Revenue Chart (col-span-2) */}
      <div className="col-span-1 md:col-span-2 aspect-[16/9] md:aspect-auto md:min-h-0 overflow-hidden bg-white border border-neutral-100 rounded-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-neutral-600" />
            <div>
              <h2 className="text-base font-bold text-neutral-900">{t('revenue')}</h2>
              <p className="text-xs text-neutral-500">{t('todayLabel')}</p>
            </div>
          </div>
          <Link
            href={`${adminBase}/reports`}
            className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 hover:text-[#CCFF00] transition-colors"
          >
            {t('viewAll')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="flex-1 min-h-0 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueChartData}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#CCFF00" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#CCFF00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{
                  background: '#171717',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#fff',
                }}
                formatter={(value: number | undefined) => [value ?? 0, t('ordersCount')]}
              />
              <Area
                type="monotone"
                dataKey="orders"
                stroke="#CCFF00"
                fill="url(#revenueGradient)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick Actions (col-span-1) */}
      <div className="overflow-auto bg-white border border-neutral-100 rounded-xl flex flex-col">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h2 className="text-base font-bold text-neutral-900">{t('quickActions')}</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2">
          <Link
            href={`${adminBase}/kitchen`}
            className="flex items-center gap-3 p-3 border border-neutral-100 rounded-xl hover:border-[#CCFF00] transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-[#CCFF00]/20 transition-colors">
              <ChefHat className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-900">{t('kitchenLabel')}</h3>
              <p className="text-xs text-neutral-500">{t('viewKdsSubtitle')}</p>
            </div>
          </Link>
          <Link
            href={`${adminBase}/orders`}
            className="flex items-center gap-3 p-3 border border-neutral-100 rounded-xl hover:border-[#CCFF00] transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-[#CCFF00]/20 transition-colors">
              <ShoppingBag className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-900">{t('ordersLabel')}</h3>
              <p className="text-xs text-neutral-500">{t('manageOrdersSubtitle')}</p>
            </div>
          </Link>
          <Link
            href={`${adminBase}/items`}
            className="flex items-center gap-3 p-3 border border-neutral-100 rounded-xl hover:border-[#CCFF00] transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-[#CCFF00]/20 transition-colors">
              <UtensilsCrossed className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-900">{t('dishesLabel')}</h3>
              <p className="text-xs text-neutral-500">{t('manageDishes')}</p>
            </div>
          </Link>
          <Link
            href={`${adminBase}/reports`}
            className="flex items-center gap-3 p-3 border border-neutral-100 rounded-xl hover:border-[#CCFF00] transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-[#CCFF00]/20 transition-colors">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-900">{t('reportsLabel')}</h3>
              <p className="text-xs text-neutral-500">{t('viewStats')}</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
