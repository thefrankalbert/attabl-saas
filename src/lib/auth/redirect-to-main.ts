import { redirect } from 'next/navigation';

const mainDomain = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export function redirectToLogin(): never {
  redirect(`${mainDomain}/login`);
}

export function redirectToUnauthorized(): never {
  redirect(`${mainDomain}/unauthorized`);
}
