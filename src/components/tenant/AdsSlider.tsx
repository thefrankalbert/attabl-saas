'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { cn } from '@/lib/utils';
import type { Ad } from '@/types/admin.types';

interface AdsSliderProps {
  ads: Ad[];
  aspectRatio?: 'video' | 'wide';
}

export default function AdsSlider({ ads, aspectRatio = 'video' }: AdsSliderProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 5000 })]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', () => setSelectedIndex(emblaApi.selectedScrollSnap()));
  }, [emblaApi]);

  if (!ads || ads.length === 0) return null;

  return (
    <div className="relative mb-8 rounded-xl overflow-hidden shadow-sm group">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {ads.map((ad, index) => (
            <div className="flex-[0_0_100%] min-w-0 relative" key={ad.id}>
              <div
                className={cn(
                  'relative w-full bg-gray-100',
                  aspectRatio === 'video' ? 'aspect-video' : 'aspect-[21/9]',
                )}
              >
                <Image
                  src={ad.image_url}
                  alt={`Banner ${index + 1}`}
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
                    aria-label="Voir l'offre"
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
          <button
            key={index}
            className={cn(
              'w-1.5 h-1.5 rounded-full transition-all duration-300',
              index === selectedIndex ? 'bg-white w-4' : 'bg-white/50 hover:bg-white/80',
            )}
            onClick={() => emblaApi?.scrollTo(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
