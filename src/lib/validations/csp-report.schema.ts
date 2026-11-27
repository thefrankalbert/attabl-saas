import { z } from 'zod';

/**
 * Rapports de violation CSP envoyes par les navigateurs. Deux formats:
 *  - `application/csp-report` (directive `report-uri`): `{ "csp-report": {...} }`;
 *  - `application/reports+json` (Reporting API): tableau de rapports.
 * Seuls les champs resumes dans les journaux sont decrits, tous bornes.
 */

const champ = z.string().max(2048).optional();

export const cspReportUriSchema = z.object({
  'csp-report': z.object({
    'document-uri': champ,
    'violated-directive': champ,
    'effective-directive': champ,
    'blocked-uri': champ,
  }),
});

export const reportingApiSchema = z
  .array(
    z.object({
      type: z.string().max(100),
      url: champ,
      body: z
        .object({
          documentURL: champ,
          effectiveDirective: champ,
          blockedURL: champ,
        })
        .optional(),
    }),
  )
  .max(100);
