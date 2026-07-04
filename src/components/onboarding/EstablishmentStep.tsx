'use client';

import { useTranslations } from 'next-intl';
import type { OnboardingData } from '@/app/onboarding/page';
import { IdentitySection } from './establishment/IdentitySection';
import { DetailsSection } from './establishment/DetailsSection';

interface EstablishmentStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
  variant?: 'identity' | 'details';
}

export function EstablishmentStep({
  data,
  updateData,
  variant = 'identity',
}: EstablishmentStepProps) {
  const t = useTranslations('onboarding');

  const showIdentity = variant === 'identity';
  const showDetails = variant === 'details';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto" data-onboarding-scroll>
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <div className="mx-auto w-full max-w-xl">
            {/* Header */}
            <div className="mb-8">
              <h1 className="mb-1.5 text-xl font-semibold tracking-tight text-app-text">
                {showDetails ? t('addressLabel') : t('establishmentTitle')}
              </h1>
              <p className="text-sm text-app-text-secondary">
                {showDetails ? t('phoneLabel') : t('establishmentSubtitle')}
              </p>
            </div>

            {showIdentity && <IdentitySection data={data} updateData={updateData} />}

            {showDetails && <DetailsSection data={data} updateData={updateData} />}
          </div>
        </div>
      </div>
    </div>
  );
}
