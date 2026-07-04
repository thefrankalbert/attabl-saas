import { Palette } from 'lucide-react';

// --- Phase / sub-screen definitions --------------------------------------------

export type ScreenKey =
  | 'establishment'
  | 'branding'
  | 'details'
  | 'tables'
  | 'menu'
  | 'qr'
  | 'summary';

export interface PhaseDefinition {
  labelKey: string;
  icon: typeof Palette;
  subScreens: ScreenKey[];
}

/** Map screen key → old API step number for saving */
export const SCREEN_TO_API_STEP: Record<ScreenKey, number> = {
  establishment: 1,
  branding: 3,
  details: 1,
  tables: 2,
  menu: 4,
  qr: 5,
  summary: 5,
};

/** Convert old saved step → new phase/subScreen */
export function oldStepToPhaseScreen(oldStep: number): { phase: number; subScreen: number } {
  switch (oldStep) {
    case 1:
      return { phase: 1, subScreen: 0 };
    case 2:
      return { phase: 2, subScreen: 0 };
    case 3:
      return { phase: 1, subScreen: 1 };
    case 4:
      return { phase: 2, subScreen: 1 };
    case 5:
      return { phase: 3, subScreen: 0 };
    default:
      return { phase: 0, subScreen: 0 };
  }
}
