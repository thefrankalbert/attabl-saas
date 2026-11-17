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

export function redirectToUnauthorized(): never {
  redirect(`${mainDomain}/unauthorized`);
}
