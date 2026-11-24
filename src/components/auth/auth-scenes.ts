import { useSyncExternalStore } from 'react';

/**
 * Photo(s) shown behind each auth screen. The key is also the i18n key of the
 * sentence laid over the photo (`authShell.phrases.<scene>`).
 * Login and signup share the SAME array: the slideshow keeps running when the
 * visitor goes from one to the other.
 */
const photo = (name: string) => `/auth/cnx-${name}.webp`;

const SLIDESHOW = ['accueil', 'cuisine', 'service', 'bar', 'patisserie', 'salle'].map(photo);

export const AUTH_SCENES = {
  login: SLIDESHOW,
  signup: SLIDESHOW,
  confirm: [photo('salle')],
  forgot: [photo('patisserie')],
  reset: [photo('cuisine')],
  emailChange: [photo('accueil')],
  invite: [photo('service')],
  unauthorized: [photo('bar')],
} as const satisfies Record<string, readonly string[]>;

export type AuthScene = keyof typeof AUTH_SCENES;

// ponytail: one module-level value instead of a context provider. The only
// override today is the "check your inbox" screen, which AuthForm renders in
// place of the signup form: it has no route of its own, so it cannot pass its
// scene to the shell through props. Move to a provider if several screens ever
// need to override at the same time.
let override: AuthScene | null = null;
const listeners = new Set<() => void>();

export function setAuthSceneOverride(scene: AuthScene | null): void {
  override = scene;
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useAuthSceneOverride(): AuthScene | null {
  return useSyncExternalStore(
    subscribe,
    () => override,
    () => null,
  );
}
