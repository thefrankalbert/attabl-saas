import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

const PHOTOS = [
  {
    key: 'patron',
    width: 1400,
    sizes: '(min-width: 1024px) 25vw, 50vw',
    className:
      'size-full rounded-[18px] object-cover max-lg:aspect-[3/4] lg:col-span-3 lg:row-span-2',
  },
  {
    key: 'grill',
    width: 1400,
    sizes: '(min-width: 1024px) 42vw, 50vw',
    className: 'size-full rounded-[18px] object-cover max-lg:aspect-[3/4] lg:col-span-5',
  },
  {
    key: 'serveuse',
    width: 1400,
    sizes: '(min-width: 1024px) 33vw, 50vw',
    className:
      'size-full rounded-[18px] object-cover object-top max-lg:aspect-square lg:col-span-4 lg:row-span-2',
  },
  {
    key: 'associes',
    width: 1046,
    sizes: '(min-width: 1024px) 42vw, 50vw',
    className:
      'size-full rounded-[18px] object-cover object-[50%_30%] max-lg:aspect-square lg:col-span-5',
  },
] as const;

export async function HomeMosaic() {
  const t = await getTranslations('marketing.home.mosaic');

  return (
    <section
      className="mx-auto max-w-[1440px] px-5 py-20 lg:px-8 lg:py-28"
      aria-labelledby="mosaique-titre"
    >
      <h2
        id="mosaique-titre"
        className="mx-auto max-w-[24ch] text-balance text-center font-titre text-[36px] leading-[1.05] tracking-[-0.015em] text-encre sm:text-[52px] dark:text-white"
      >
        {t('title')}
      </h2>
      <div className="mt-14 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12 lg:grid-rows-[260px_260px]">
        {PHOTOS.map((p) => (
          <Image
            key={p.key}
            src={`/marketing/home/${p.key}.webp`}
            alt={t(`images.${p.key}`)}
            width={p.width}
            height={1400}
            sizes={p.sizes}
            className={p.className}
          />
        ))}
      </div>
    </section>
  );
}
