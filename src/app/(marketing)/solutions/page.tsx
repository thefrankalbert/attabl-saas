import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SolutionsHero } from '@/components/marketing/solutions/SolutionsHero';
import { IndustryRow, type IndustryKey } from '@/components/marketing/solutions/IndustryRow';
import { SolutionsUseCases } from '@/components/marketing/solutions/SolutionsUseCases';
import { SolutionsSteps } from '@/components/marketing/solutions/SolutionsSteps';
import { SolutionsCta } from '@/components/marketing/solutions/SolutionsCta';

export const revalidate = 3600; // ISR

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.solutions');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

const INDUSTRIES: {
  key: IndustryKey;
  offer: string;
  media: { src: string; w: number; h: number };
}[] = [
  {
    key: 'restaurant',
    offer: 'Pro',
    media: { src: '/marketing/sc-dashboard.png', w: 2401, h: 1617 },
  },
  {
    key: 'hotel',
    offer: 'Business',
    media: { src: '/marketing/screen-inventaire.png', w: 2360, h: 1640 },
  },
  { key: 'qsr', offer: 'Starter', media: { src: '/marketing/sc-dashboard.png', w: 2401, h: 1617 } },
  {
    key: 'bar',
    offer: 'Pro',
    media: { src: '/marketing/screen-inventaire.png', w: 2360, h: 1640 },
  },
];

export default function SolutionsPage() {
  return (
    <>
      <SolutionsHero />
      {INDUSTRIES.map((ind, i) => (
        <IndustryRow
          key={ind.key}
          index={i}
          keyName={ind.key}
          offer={ind.offer}
          media={ind.media}
          reverse={i % 2 === 1}
        />
      ))}
      <SolutionsUseCases />
      <SolutionsSteps />
      <SolutionsCta />
    </>
  );
}
