import { ComponentType } from 'react';
import type { QRTemplateProps, QRTemplateId } from '@/types/qr-design.types';

import { StandardTemplate } from './StandardTemplate';
import { ChevaletTemplate } from './ChevaletTemplate';
import { CarteTemplate } from './CarteTemplate';
import { MinimalTemplate } from './MinimalTemplate';
import { ElegantTemplate } from './ElegantTemplate';
import { NeonTemplate } from './NeonTemplate';

export const TEMPLATE_REGISTRY: Record<QRTemplateId, ComponentType<QRTemplateProps>> = {
  standard: StandardTemplate,
  chevalet: ChevaletTemplate,
  carte: CarteTemplate,
  minimal: MinimalTemplate,
  elegant: ElegantTemplate,
  neon: NeonTemplate,
};

export {
  StandardTemplate,
  ChevaletTemplate,
  CarteTemplate,
  MinimalTemplate,
  ElegantTemplate,
  NeonTemplate,
};

export type { QRTemplateProps };
