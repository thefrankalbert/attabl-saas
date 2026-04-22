'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Ad, Announcement } from '@/types/admin.types';
import { MENU_COLORS as C, tr } from '@/lib/tenant/menu-tokens';

interface PromoBannerProps {
  announcements: Announcement[];
  ads: Ad[];
  lang: string;
}

export function PromoBanner({ announcements, ads, lang }: PromoBannerProps) {
  const t = useTranslations('tenant');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const promoLabel = t('bannerPromoLabel');
  const slides: { imageUrl: string; label: string; title: string }[] = [];
  ads.forEach((ad) => {
    if (ad.image_url) {
      slides.push({ imageUrl: ad.image_url, label: promoLabel, title: '' });
    }
  });
  announcements.forEach((a) => {
    slides.push({
      imageUrl: a.image_url || '',
      label: promoLabel,
      title: tr(lang, a.title, a.title_en),
    });
  });

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % slides.length;
        scrollRef.current?.scrollTo({
          left: next * scrollRef.current.offsetWidth,
          behavior: 'smooth',
        });
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div className="mt-5">
      <div
        ref={scrollRef}
        onScroll={() => {
          if (!scrollRef.current) return;
          const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
          setActiveIdx(idx);
        }}
        className="flex overflow-x-auto snap-x snap-mandatory px-4 gap-3 scrollbar-hide"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="min-w-[calc(100%-32px)] snap-start h-40 rounded-xl overflow-hidden relative shrink-0"
          >
            {slide.imageUrl ? (
              <Image
                src={slide.imageUrl}
                alt={slide.title || 'Promotion'}
                fill
                sizes="400px"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: C.primary }} />
            )}
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)' }}
            />
            <div className="absolute bottom-4 left-4 z-[2]">
              {slide.label && (
                <span
                  className="text-[11px] font-medium tracking-[1px]"
                  style={{ color: C.textOnPrimary }}
                >
                  {slide.label}
                </span>
              )}
              {slide.title && (
                <p
                  className="text-xl font-bold mt-1 leading-[1.4]"
                  style={{ color: C.textOnPrimary }}
                >
                  {slide.title}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {slides.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-[3px] transition-all duration-200 ease-in-out"
              style={{
                width: activeIdx === i ? 20 : 6,
                background: activeIdx === i ? C.primary : C.divider,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
