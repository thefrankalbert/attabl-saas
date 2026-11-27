import { redirect } from 'next/navigation';

const mainDomain = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export function redirectToLogin(): never {
  redirect(`${mainDomain}/login`);
}

/**
 * Apres une suppression de compte: la page de connexion avec le bandeau de
 * confirmation. Redirection SERVEUR depuis l'action, sinon la reponse de
 * l'action re-rend la page admin courante, dont le layout ne trouve plus de
 * session et renvoie vers /login sans le bandeau.
 */
export function redirectToLoginAfterAccountDeletion(): never {
  redirect(`${mainDomain}/login?deleted=true`);
}

/**
 * Double authentification a faire (code ou activation) avant `next`, un chemin
 * interne du domaine principal. /auth/mfa revalide `next` de son cote.
 */
export function redirectToMfa(next: string): never {
  redirect(`${mainDomain}/auth/mfa?next=${encodeURIComponent(next)}`);
}

export function redirectToUnauthorized(): never {
  redirect(`${mainDomain}/unauthorized`);
}
