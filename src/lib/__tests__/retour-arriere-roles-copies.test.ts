import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lot 1 des roles du personnel, notes N8 et N9 du contre-audit.
 *
 * Les scripts de retour arriere (supabase/retour-arriere/) remettent en place
 * les fonctions et les politiques d'AVANT le lot, recopiees mot pour mot de
 * supabase/schema.sql. Deux facons de les rendre fausses sans rien casser de
 * visible :
 *
 *   N9. Une autre migration modifie l'une de ces fonctions ou politiques apres
 *       la copie. Le script restaurerait alors un corps perime sans rien
 *       signaler. D'ou l'egalite stricte avec schema.sql, et l'interdiction
 *       pour une migration posterieure a l'instantane (hors lot 1) de toucher
 *       a ces objets.
 *   N8. MIG2 renomme une politique. Le retour arriere supprime par l'ANCIEN
 *       nom : la nouvelle politique resterait en place a cote de l'ancienne,
 *       et comme les politiques se cumulent, la plus large l'emporterait.
 *
 * A relancer le JOUR de l'application en production (pnpm test).
 *
 * Fin de vie : ce test et les scripts sont supprimes dans la PR qui regenere
 * supabase/schema.sql apres l'application du lot (le retour arriere de la base
 * est interdit des que le nouveau code est servi).
 */
const SUPABASE = join(process.cwd(), 'supabase');
const SCHEMA = readFileSync(join(SUPABASE, 'schema.sql'), 'utf8');
const RETOUR_MIG2 = readFileSync(
  join(SUPABASE, 'retour-arriere', '20261128100100_retour_resolution_par_roles.sql'),
  'utf8',
);
const RETOUR_MIG1 = readFileSync(
  join(SUPABASE, 'retour-arriere', '20261128100000_retour_postes_colonnes.sql'),
  'utf8',
);
const MIG2 = readFileSync(
  join(SUPABASE, 'migrations', '20261128100100_resolution_par_postes_et_politiques.sql'),
  'utf8',
);

/** Les trois migrations du lot : elles ont le droit de toucher a ces objets. */
const MIGRATIONS_DU_LOT = [
  '20261128100000_postes_colonnes_et_reprise.sql',
  '20261128100100_resolution_par_postes_et_politiques.sql',
  '20261128100200_gardes_prix_et_proprietaire.sql',
];

const FONCTIONS_MIG2 = [
  'has_tenant_write_permission',
  'has_tenant_money_permission',
  'has_tenant_floor_permission',
  'record_refund',
  'assert_tenant_reports_view',
  'reassign_order_table',
  'get_my_inventory_tenant_ids',
  'get_my_tenant_ids',
  'get_my_tenant_ids_array',
  'audit_log_auteur_session',
];
const FONCTIONS_MIG1 = ['accept_invitation_membership'];

interface Copie {
  nom: string;
  texte: string;
}

/** Blocs `CREATE OR REPLACE FUNCTION "public"."nom"( ... $$;` d'un script. */
function fonctionsCopiees(script: string): Copie[] {
  const motif = /^CREATE OR REPLACE FUNCTION "public"\."(\w+)"\([\s\S]*?\n\s*\$\$;\n/gm;
  return [...script.matchAll(motif)].map((m) => ({ nom: m[1], texte: m[0] }));
}

/** Blocs `CREATE POLICY "nom" ON "public"."table" ... ;` d'un script. */
function politiquesCopiees(script: string): (Copie & { table: string })[] {
  const motif = /^CREATE POLICY ("[^"]+") ON "public"\."(\w+)"[\s\S]*?;\n/gm;
  return [...script.matchAll(motif)].map((m) => ({ nom: m[1], table: m[2], texte: m[0] }));
}

/** La copie telle qu'elle figure dans schema.sql (qui ecrit `CREATE FUNCTION`). */
function commeDansSchema(copie: string): string {
  return copie.replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION');
}

function migrationsPosterieures(): string[] {
  const marqueur = /^-- SCHEMA_SNAPSHOT_MIGRATION=(\d+)/m.exec(SCHEMA)?.[1];
  if (!marqueur) throw new Error('marqueur SCHEMA_SNAPSHOT_MIGRATION absent de schema.sql');
  return readdirSync(join(SUPABASE, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => BigInt(f.split('_')[0]) > BigInt(marqueur))
    .sort();
}

/** Une migration definit-elle cette fonction du schema public ? */
function definitFonction(sql: string, nom: string): boolean {
  return new RegExp(`FUNCTION\\s+"?public"?\\."?${nom}"?\\s*\\(`, 'i').test(sql);
}

describe('retour arriere du lot 1 des roles : copies identiques a schema.sql (N9)', () => {
  const fonctionsMig2 = fonctionsCopiees(RETOUR_MIG2);
  const fonctionsMig1 = fonctionsCopiees(RETOUR_MIG1);
  const politiques = politiquesCopiees(RETOUR_MIG2);

  it('les copies sont bien lues (temoin)', () => {
    expect(fonctionsMig2.map((f) => f.nom)).toEqual(FONCTIONS_MIG2);
    expect(fonctionsMig1.map((f) => f.nom)).toEqual(FONCTIONS_MIG1);
    expect(politiques).toHaveLength(24);
    // L'etat d'AVANT : les codes que le lot retire du catalogue y figurent.
    expect(RETOUR_MIG2).toContain("'orders.manage'");
    expect(RETOUR_MIG2).toContain("'reports.view'");
  });

  it.each([...fonctionsMig2, ...fonctionsMig1])(
    'fonction $nom : identique a schema.sql, caractere pour caractere',
    ({ texte }) => {
      expect(SCHEMA.includes(commeDansSchema(texte))).toBe(true);
    },
  );

  it.each(politiques)('politique $nom : identique a schema.sql', ({ texte }) => {
    expect(SCHEMA.includes(texte)).toBe(true);
  });

  it('un seul caractere different fait echouer la comparaison (temoin)', () => {
    const fonction = fonctionsMig2[0].texte;
    const alteree = fonction.replace("'orders.pay'", "'orders.pai'");
    expect(alteree).not.toBe(fonction);
    expect(SCHEMA.includes(commeDansSchema(alteree))).toBe(false);

    const politique = politiques[0].texte;
    const politiqueAlteree = politique.replace('orders.manage', 'orders.manag');
    expect(politiqueAlteree).not.toBe(politique);
    expect(SCHEMA.includes(politiqueAlteree)).toBe(false);
  });

  it('chaque politique recreee est d abord supprimee, sous le meme nom et la meme table', () => {
    for (const { nom, table } of politiques) {
      expect(RETOUR_MIG2).toContain(`DROP POLICY IF EXISTS ${nom} ON "public"."${table}";`);
    }
  });

  it('aucune migration posterieure a l instantane, hors lot 1, ne touche a ces objets', () => {
    const posterieures = migrationsPosterieures();
    // Temoin : la detection voit bien les migrations du lot.
    expect(posterieures).toEqual(expect.arrayContaining(MIGRATIONS_DU_LOT));
    expect(definitFonction(MIG2, 'has_tenant_write_permission')).toBe(true);
    expect(MIG2).toContain(politiques[0].nom);

    const fautes: string[] = [];
    for (const fichier of posterieures.filter((f) => !MIGRATIONS_DU_LOT.includes(f))) {
      const sql = readFileSync(join(SUPABASE, 'migrations', fichier), 'utf8');
      for (const nom of [...FONCTIONS_MIG2, ...FONCTIONS_MIG1]) {
        if (definitFonction(sql, nom)) fautes.push(`${fichier} redefinit la fonction ${nom}`);
      }
      for (const { nom } of politiques) {
        if (sql.includes(nom)) fautes.push(`${fichier} touche la politique ${nom}`);
      }
    }
    expect(fautes).toEqual([]);
  });
});

describe('MIG2 garde le nom exact de chaque politique qu elle remplace (N8)', () => {
  const anciennes = politiquesCopiees(RETOUR_MIG2).map((p) => `${p.nom} ON "public"."${p.table}"`);
  const supprimees = [
    '"tenant_admins_can_insert_invitations" ON "public"."invitations"',
    '"tenant_admins_can_update_invitations" ON "public"."invitations"',
  ];
  const nouvelles = politiquesCopiees(MIG2).map((p) => `${p.nom} ON "public"."${p.table}"`);

  it('22 politiques recreees sous le meme nom, 2 supprimees, aucune autre', () => {
    expect(anciennes).toEqual(expect.arrayContaining(supprimees));
    expect([...nouvelles].sort()).toEqual(anciennes.filter((p) => !supprimees.includes(p)).sort());
    for (const politique of supprimees) {
      expect(MIG2).toContain(`DROP POLICY IF EXISTS ${politique};`);
    }
  });

  it('chaque politique recreee par MIG2 est d abord supprimee (migration rejouable)', () => {
    for (const politique of nouvelles) {
      expect(MIG2).toContain(`DROP POLICY IF EXISTS ${politique};`);
    }
  });
});
