import { ComponentType } from 'react';
import type { QRTemplateProps, QRTemplateId } from '@/types/qr-design.types';

import { MinimalTemplate } from './MinimalTemplate';
import { CarteTemplate } from './CarteTemplate';
import { ChevaletTemplate } from './ChevaletTemplate';

export const TEMPLATE_REGISTRY: Record<QRTemplateId, ComponentType<QRTemplateProps>> = {
  minimal: MinimalTemplate,
  carte: CarteTemplate,
  chevalet: ChevaletTemplate,
};

export type { QRTemplateProps };
