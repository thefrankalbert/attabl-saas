'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

interface SparklinePoint {
  value: number;
}

interface StatsCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
  sparklineData?: SparklinePoint[];
}

export default function StatsCard({
  title,
  value,
  trend,
  subtitle,
  sparklineData,
}: StatsCardProps) {
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow">
      {/* Label */}
      <p className="text-xs uppercase tracking-wide text-zinc-400 font-medium">{title}</p>

      {/* Value */}
      <div className="text-3xl sm:text-4xl font-bold text-zinc-900 tracking-tight mt-1">
        {value}
      </div>

      {/* Trend pill + subtitle */}
      <div className="flex items-center gap-2 mt-2">
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
              trend.isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
            )}
          >
            {trend.isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {trend.value > 0 ? '+' : ''}
            {trend.value}%
          </span>
        )}
        {subtitle && <span className="text-xs text-zinc-400 font-medium">{subtitle}</span>}
      </div>

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="mt-3 -mx-1">
          <ResponsiveContainer width="100%" height={28}>
            <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient
                  id={`spark-${title.replace(/\s/g, '')}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#CCFF00" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#CCFF00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#CCFF00"
                fill={`url(#spark-${title.replace(/\s/g, '')})`}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-5 sm:p-6 animate-pulse shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="h-3 w-16 bg-zinc-200 rounded" />
      <div className="h-9 w-20 bg-zinc-200 rounded mt-2" />
      <div className="h-4 w-14 bg-zinc-100 rounded-full mt-3" />
      <div className="h-7 w-full bg-zinc-50 rounded mt-3" />
    </div>
  );
}
