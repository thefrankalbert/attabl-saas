'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Ad } from '@/types/admin.types';

interface AdsSliderProps {
  ads: Ad[];
  aspectRatio?: 'video' | 'wide';
}

export default function AdsSlider({ ads, aspectRatio = 'video' }: AdsSliderProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 5000 })]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const t = useTranslations('tenant');

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', () => setSelectedIndex(emblaApi.selectedScrollSnap()));
  }, [emblaApi]);

  if (!ads || ads.length === 0) return null;

  return (
    <div className="relative mb-8 rounded-[10px] overflow-hidden border border-app-border group">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {ads.map((ad, index) => (
            <div className="flex-[0_0_100%] min-w-0 relative" key={ad.id}>
              <div
                className={cn(
                  'relative w-full',
                  aspectRatio === 'video' ? 'aspect-video' : 'aspect-[21/9]',
                )}
                style={{ backgroundColor: 'rgb(246, 246, 246)' }}
              >
                <Image
                  src={ad.image_url}
                  alt={t('bannerAlt', { index: index + 1 })}
                  fill
                  className="object-cover"
                  priority={index === 0}
                />
                {ad.link && (
                  <a
                    href={ad.link}
                    target="_blank"
                    rel="noopener"
                    className="absolute inset-0 z-10"
                    aria-label={t('viewOfferAriaLabel')}
                  ></a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
        {ads.map((_, index) => (
          <Button
            key={index}
            variant="ghost"
            size="icon"
            className={cn(
              'w-2.5 h-2.5 rounded-full p-0',
              index === selectedIndex ? 'bg-white w-5' : 'bg-white/50 hover:bg-white/80',
            )}
            onClick={() => emblaApi?.scrollTo(index)}
            aria-label={t('goToSlide', { index: index + 1 })}
          />
        ))}
      </div>
    </div>
  );
}
