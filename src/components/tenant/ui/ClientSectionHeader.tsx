'use client';

import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { T } from '@/lib/ui/client-tokens';

interface ClientSectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}

export function ClientSectionHeader({
  title,
  subtitle,
  action,
  onAction,
}: ClientSectionHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
        fontFamily: T.font,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 19,
            fontWeight: 800,
            color: T.ink,
            letterSpacing: -0.3,
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 12.5, color: T.ink4, marginTop: 3 }}>{subtitle}</div>}
      </div>
      {action && (
        <Button
          variant="ghost"
          onClick={onAction}
          className="p-0 h-auto"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: T.ink2,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {action}
          <ChevronRight size={14} />
        </Button>
      )}
    </div>
  );
}
