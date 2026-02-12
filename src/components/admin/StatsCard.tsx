'use client';

import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'gold';
  subtitle?: string;
}

const COLOR_MAP: Record<string, string> = {
  blue: 'text-blue-600 bg-blue-50',
  green: 'text-emerald-600 bg-emerald-50',
  orange: 'text-orange-600 bg-orange-50',
  purple: 'text-purple-600 bg-purple-50',
  gold: 'text-amber-600 bg-amber-50',
};

export default function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  subtitle,
  color = 'blue',
}: StatsCardProps) {
  const [textColor, bgColor] = (COLOR_MAP[color] || COLOR_MAP.blue).split(' ');

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-6 flex flex-col justify-between h-full hover:bg-gray-50/50 transition-colors duration-300">
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-1">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{title}</h3>
          <div className="text-3xl font-black text-gray-900 tracking-tight">{value}</div>
        </div>

        {Icon && (
          <div className={cn('p-3 rounded-xl', bgColor, textColor)}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-auto pt-2">
        {trend && (
          <div
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
              trend.isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
            )}
          >
            {trend.isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span>{trend.value}%</span>
          </div>
        )}
        {subtitle && <span className="text-xs text-gray-400 font-medium ml-auto">{subtitle}</span>}
      </div>
    </div>
  );
}

// Skeleton pour l'état de chargement
export function StatsCardSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-6 animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-gray-200 rounded" />
          <div className="h-8 w-16 bg-gray-200 rounded" />
        </div>
        <div className="w-12 h-12 bg-gray-100 rounded-xl" />
      </div>
      <div className="h-3 w-24 bg-gray-100 rounded mt-4" />
    </div>
  );
}
