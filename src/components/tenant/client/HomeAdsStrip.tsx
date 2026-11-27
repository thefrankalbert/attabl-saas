import Image from 'next/image';
import { isRenderableImageUrl } from '@/lib/validations/image-url.schema';

export interface HomeAd {
  id: string;
  image_url: string;
  link: string | null;
}

interface HomeAdsStripProps {
  ads: HomeAd[];
  label: string;
  openLabel: string;
}

/** Lien sur de la banniere: http(s) seulement (la base l'impose aussi). */
function safeLink(link: string | null): string | null {
  if (!link) return null;
  return /^https?:\/\//i.test(link) ? link : null;
}

/**
 * Bannieres publicitaires du restaurant (page Publicites de l'admin), en tete
 * de la page d'accueil de la carte. Defilement horizontal, une banniere au
 * format 2:1 par carte. Une image hors de notre stockage est ignoree: next/image
 * la refuserait au rendu et ferait tomber toute la page.
 */
export function HomeAdsStrip({ ads, label, openLabel }: HomeAdsStripProps) {
  const visibles = ads.filter((ad) => isRenderableImageUrl(ad.image_url));
  if (visibles.length === 0) return null;

  return (
    <section aria-label={label} className="pb-6">
      <ul className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 scrollbar-none">
        {visibles.map((ad, index) => {
          const href = safeLink(ad.link);
          const image = (
            <div className="relative aspect-[2/1] w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)]">
              <Image
                src={ad.image_url}
                alt={href ? openLabel : label}
                fill
                priority={index === 0}
                sizes="(max-width: 600px) 88vw, 520px"
                className="object-cover"
              />
            </div>
          );
          return (
            <li
              key={ad.id}
              className={`shrink-0 snap-start ${visibles.length > 1 ? 'w-[88%] max-w-[520px]' : 'w-full max-w-[640px]'}`}
            >
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="block">
                  {image}
                </a>
              ) : (
                image
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
