/**
 * Identite de l'entreprise affichee dans la politique de confidentialite.
 *
 * UN SEUL fichier a completer. Chaque champ vide est simplement omis de la page:
 * aucun texte provisoire n'est montre au public. Le proprietaire renseigne les
 * valeurs reelles ici, puis la page les affiche d'elle-meme.
 */
export interface CompanyIdentity {
  /** Raison sociale. */
  legalName: string;
  /** Forme juridique (SARL, entreprise individuelle, ...). */
  legalForm: string;
  /** Numero RCCM. */
  rccm: string;
  /** Numero d'identifiant unique (NIU). */
  niu: string;
  /** Adresse du siege social. */
  headOffice: string;
  /** Adresse de l'etablissement ou du representant au Burkina Faso. */
  burkinaAddress: string;
}

export const COMPANY: CompanyIdentity = {
  legalName: '',
  legalForm: '',
  rccm: '',
  niu: '',
  headOffice: '',
  burkinaAddress: '',
};

/** Adresse dediee aux demandes sur les donnees personnelles. */
export const PRIVACY_EMAIL = 'privacy@attabl.com';

/** Les lignes d'identite renseignees, dans l'ordre d'affichage. */
export function filledCompanyFields(
  company: CompanyIdentity = COMPANY,
): { key: keyof CompanyIdentity; value: string }[] {
  const keys: (keyof CompanyIdentity)[] = [
    'legalName',
    'legalForm',
    'rccm',
    'niu',
    'headOffice',
    'burkinaAddress',
  ];
  return keys
    .map((key) => ({ key, value: company[key].trim() }))
    .filter((field) => field.value.length > 0);
}
