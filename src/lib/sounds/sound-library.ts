/**
 * Sound Library - Pre-installed notification sounds for ATTABL
 *
 * Source: Kenney "Interface Sounds" (https://kenney.nl/assets/interface-sounds),
 * licence CC0 (domaine public). Each file plays the Kenney sound twice with a
 * short gap, so an alert stays audible in a noisy kitchen.
 *
 * The ids (classic-bell, zen-bowl, ...) are historical: they are saved in
 * tenants.notification_sound_id, so they are kept as-is when the sound behind
 * them changes. Only the name shown to the restaurateur follows the sound.
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

/**
 * Bump when a file under public/sounds changes: the service worker caches audio
 * by URL (serwist defaultCache, up to 24 h), so a new URL is what makes
 * restaurants already set up hear the new sound right away.
 */
const SOUND_FILES_VERSION = 2;

export const SOUND_LIBRARY: SoundDefinition[] = [
  // --- Free sounds (Plan Essentiel) ---------------------
  {
    id: 'classic-bell',
    name: 'Confirmation',
    description: 'Deux notes claires, bien audibles en salle',
    file: `/sounds/classic-bell.wav?v=${SOUND_FILES_VERSION}`,
    isPremium: false,
    duration: 1.3,
  },
  {
    id: 'gentle-chime',
    name: 'Verre',
    description: 'Tintement de verre net et lumineux',
    file: `/sounds/gentle-chime.wav?v=${SOUND_FILES_VERSION}`,
    isPremium: false,
    duration: 1.6,
  },
  {
    id: 'simple-ding',
    name: 'Note claire',
    description: 'Double note courte et franche',
    file: `/sounds/simple-ding.wav?v=${SOUND_FILES_VERSION}`,
    isPremium: false,
    duration: 1.2,
  },

  // --- Premium sounds -----------------------------------
  {
    id: 'elegant-tone',
    name: 'Confirmation douce',
    description: 'Deux notes rondes et posées',
    file: `/sounds/elegant-tone.wav?v=${SOUND_FILES_VERSION}`,
    isPremium: true,
    duration: 1.2,
  },
  {
    id: 'crystal-bell',
    name: 'Cristal',
    description: 'Double tintement bref et brillant',
    file: `/sounds/crystal-bell.wav?v=${SOUND_FILES_VERSION}`,
    isPremium: true,
    duration: 0.8,
  },
  {
    id: 'soft-marimba',
    name: 'Bois',
    description: 'Deux notes boisées et chaleureuses',
    file: `/sounds/soft-marimba.wav?v=${SOUND_FILES_VERSION}`,
    isPremium: true,
    duration: 0.8,
  },
  {
    id: 'zen-bowl',
    name: 'Montée',
    description: 'Deux notes qui montent, pour ne rien manquer',
    file: `/sounds/zen-bowl.wav?v=${SOUND_FILES_VERSION}`,
    isPremium: true,
    duration: 1.2,
  },
  {
    id: 'luxury-chime',
    name: 'Montée courte',
    description: 'Deux notes montantes et rapides',
    file: `/sounds/luxury-chime.wav?v=${SOUND_FILES_VERSION}`,
    isPremium: true,
    duration: 1.0,
  },
  {
    id: 'wooden-knock',
    name: 'Ouverture',
    description: 'Double signal discret',
    file: `/sounds/wooden-knock.wav?v=${SOUND_FILES_VERSION}`,
    isPremium: true,
    duration: 0.8,
  },
  {
    id: 'brass-bell',
    name: 'Signal bref',
    description: 'Double signal très court',
    file: `/sounds/brass-bell.wav?v=${SOUND_FILES_VERSION}`,
    isPremium: true,
    duration: 0.8,
  },
];

/** Default sound for new tenants */
export const DEFAULT_SOUND_ID = 'classic-bell';

/** Get a sound definition by ID */
function getSoundById(id: string): SoundDefinition | undefined {
  return SOUND_LIBRARY.find((s) => s.id === id);
}

/** Check if a sound ID represents a custom uploaded sound */
export function isCustomSound(id?: string | null): boolean {
  return !!id && id.startsWith('http');
}

/** Get the file path for a sound ID (with fallback to default) */
export function getSoundFile(id?: string | null): string {
  if (!id) return SOUND_LIBRARY[0].file;
  if (isCustomSound(id)) return id;
  const sound = getSoundById(id);
  return sound?.file || SOUND_LIBRARY[0].file;
}
