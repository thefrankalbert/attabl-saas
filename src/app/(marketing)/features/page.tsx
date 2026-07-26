import { FeaturesHero } from '@/components/marketing/features/FeaturesHero';
import { FeatureCategory } from '@/components/marketing/features/FeatureCategory';
import { FeaturesCta } from '@/components/marketing/features/FeaturesCta';
import { FEATURE_CATEGORIES } from '@/components/marketing/features/features.data';

export const revalidate = 3600; // ISR

export default function FeaturesPage() {
  return (
    <>
      <FeaturesHero />
      {FEATURE_CATEGORIES.map((category, i) => (
        <FeatureCategory key={category.id} index={i} category={category} />
      ))}
      <FeaturesCta />
    </>
  );
}
