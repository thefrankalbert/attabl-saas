'use client';

import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientPhoto } from './ClientPhoto';
import { ClientBadge } from './ClientBadge';
import { T } from '@/lib/ui/client-tokens';

interface ClientPromoCardProps {
  tag?: string;
  title: string;
  subtitle?: string;
  cta?: string;
  image?: string | null;
  dark?: boolean;
  onClick?: () => void;
}

export function ClientPromoCard({
  tag,
  title,
  subtitle,
  cta = 'Decouvrir',
  image,
  dark = true,
  onClick,
}: ClientPromoCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 'calc(100% - 12px)',
        flex: '0 0 calc(100% - 12px)',
        height: 168,
        borderRadius: T.r3,
        overflow: 'hidden',
        position: 'relative',
        background: dark ? '#0A0A0A' : '#fff',
        color: dark ? '#fff' : T.ink,
        fontFamily: T.font,
        scrollSnapAlign: 'start',
        cursor: 'pointer',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        <ClientPhoto src={image} />
        {dark && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.10) 70%)',
            }}
          />
        )}
      </div>
      <div
        style={{
          position: 'relative',
          padding: 18,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          {tag && (
            <ClientBadge kind="promo" style={{ background: T.brand, color: '#0A0A0A' }}>
              {tag}
            </ClientBadge>
          )}
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              marginTop: 8,
              letterSpacing: -0.4,
              lineHeight: 1.05,
              maxWidth: '70%',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 4, maxWidth: '70%' }}>
              {subtitle}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          style={{
            alignSelf: 'flex-start',
            background: '#fff',
            color: T.ink,
            padding: '8px 14px',
            borderRadius: T.rPill,
            fontSize: 12.5,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 'auto',
          }}
        >
          {cta}
          <ArrowRight size={13} strokeWidth={2.4} />
        </Button>
      </div>
    </div>
  );
}
