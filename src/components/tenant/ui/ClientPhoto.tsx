'use client';

import Image from 'next/image';
import { Utensils, Wine } from 'lucide-react';
import { T } from '@/lib/ui/client-tokens';

interface ClientPhotoProps {
  src?: string | null;
  alt?: string;
  kind?: 'food' | 'drink';
  dark?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function ClientPhoto({
  src,
  alt = '',
  kind = 'food',
  dark = false,
  style,
  children,
}: ClientPhotoProps) {
  if (src) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 'inherit',
          overflow: 'hidden',
          position: 'relative',
          background: T.ivory,
          ...style,
        }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 640px) 50vw, 25vw"
          style={{ objectFit: 'cover' }}
        />
        {children}
      </div>
    );
  }

  const bg = dark ? '#1A1A1A' : T.ivory;
  const iconColor = dark ? 'rgba(255,255,255,0.25)' : T.ivoryInk;
  const Icon = kind === 'drink' ? Wine : Utensils;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 'inherit',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        ...style,
      }}
    >
      <Icon size={24} color={iconColor} strokeWidth={1.5} aria-hidden />
      {children}
    </div>
  );
}
