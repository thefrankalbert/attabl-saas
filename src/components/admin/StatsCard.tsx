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
    <div className="bg-app-card rounded-xl border border-app-border p-6 flex flex-col justify-between hover:border-accent/40 transition-all duration-200 group">
      {/* Label */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.1em] text-app-text-muted font-semibold">
          {title}
        </p>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold',
              trend.isPositive
                ? 'bg-status-success/10 text-status-success'
                : 'bg-status-error/10 text-status-error',
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
      </div>

      {/* Value - HUGE and bold */}
      <div className="text-[2.5rem] font-black text-app-text tracking-tighter mt-2 leading-none">
        {value}
      </div>

      {/* Subtitle */}
      {subtitle && <p className="text-xs text-app-text-muted font-medium mt-2">{subtitle}</p>}

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="mt-4 -mx-1">
          <ResponsiveContainer width="100%" height={32}>
            <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient
                  id={`spark-${title.replace(/\s/g, '')}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                fill={`url(#spark-${title.replace(/\s/g, '')})`}
                strokeWidth={2}
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
    <div className="bg-app-card rounded-xl border border-app-border p-6 animate-pulse">
      <div className="h-3 w-20 bg-app-elevated rounded" />
      <div className="h-12 w-28 bg-app-elevated rounded mt-3" />
      <div className="h-4 w-16 bg-app-bg rounded-full mt-3" />
      <div className="h-8 w-full bg-app-bg rounded mt-4" />
    </div>
  );
}
