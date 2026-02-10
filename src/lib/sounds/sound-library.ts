/**
 * Sound Library — Pre-installed notification sounds for ATTABL
 *
 * 3 sounds available on Plan Essentiel (isPremium: false)
 * All 10 sounds available on Plan Premium (isPremium: true)
 */

export interface SoundDefinition {
  id: string;
  name: string;
  description: string;
  file: string;
  isPremium: boolean;
  /** Duration in seconds (approximate) */
  duration: number;
}

export const SOUND_LIBRARY: SoundDefinition[] = [
  // ─── Free sounds (Plan Essentiel) ─────────────────────
  {
    id: 'classic-bell',
    name: 'Cloche classique',
    description: 'Son de cloche simple et clair',
    file: '/sounds/classic-bell.mp3',
    isPremium: false,
    duration: 0.8,
  },
  {
    id: 'gentle-chime',
    name: 'Carillon doux',
    description: 'Carillon court et agréable',
    file: '/sounds/gentle-chime.mp3',
    isPremium: false,
    duration: 1.2,
  },
  {
    id: 'simple-ding',
    name: 'Ding simple',
    description: 'Notification discrète et rapide',
    file: '/sounds/simple-ding.mp3',
    isPremium: false,
    duration: 0.5,
  },

  // ─── Premium sounds ───────────────────────────────────
  {
    id: 'elegant-tone',
    name: 'Ton élégant',
    description: 'Son raffiné pour restaurants haut de gamme',
    file: '/sounds/elegant-tone.mp3',
    isPremium: true,
    duration: 1.5,
  },
  {
    id: 'crystal-bell',
    name: 'Cloche cristalline',
    description: 'Tintement de cristal clair et pur',
    file: '/sounds/crystal-bell.mp3',
    isPremium: true,
    duration: 1.0,
  },
  {
    id: 'soft-marimba',
    name: 'Marimba doux',
    description: 'Notes de marimba chaleureuses',
    file: '/sounds/soft-marimba.mp3',
    isPremium: true,
    duration: 1.2,
  },
  {
    id: 'zen-bowl',
    name: 'Bol tibétain',
    description: 'Résonance zen et apaisante',
    file: '/sounds/zen-bowl.mp3',
    isPremium: true,
    duration: 2.0,
  },
  {
    id: 'luxury-chime',
    name: 'Carillon luxe',
    description: 'Carillon harmonieux multi-notes',
    file: '/sounds/luxury-chime.mp3',
    isPremium: true,
    duration: 1.5,
  },
  {
    id: 'wooden-knock',
    name: 'Frappe bois',
    description: 'Percussion bois douce et naturelle',
    file: '/sounds/wooden-knock.mp3',
    isPremium: true,
    duration: 0.6,
  },
  {
    id: 'brass-bell',
    name: 'Cloche laiton',
    description: 'Cloche de service traditionnelle',
    file: '/sounds/brass-bell.mp3',
    isPremium: true,
    duration: 1.0,
  },
];

/** Default sound for new tenants */
export const DEFAULT_SOUND_ID = 'classic-bell';

/** Get a sound definition by ID */
export function getSoundById(id: string): SoundDefinition | undefined {
  return SOUND_LIBRARY.find((s) => s.id === id);
}

/** Get the file path for a sound ID (with fallback to default) */
export function getSoundFile(id?: string | null): string {
  if (!id) return SOUND_LIBRARY[0].file;
  const sound = getSoundById(id);
  return sound?.file || SOUND_LIBRARY[0].file;
}

/** Get available sounds for a plan */
export function getAvailableSounds(isPremiumPlan: boolean): SoundDefinition[] {
  if (isPremiumPlan) return SOUND_LIBRARY;
  return SOUND_LIBRARY.filter((s) => !s.isPremium);
}
