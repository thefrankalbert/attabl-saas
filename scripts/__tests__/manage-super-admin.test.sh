#!/usr/bin/env bash
# Verrouille scripts/lib/super-admin-ops.cjs, le coeur de
# scripts/manage-super-admin.js :
#   - chaque operation tourne dans UNE transaction qui pose d'abord le reglage
#     de session attendu par le declencheur prevent_super_admin_elevation ;
#   - chaque ecriture cible (email, restaurant) et s'annule si elle ne touche
#     pas exactement une ligne ;
#   - `role` n'est jamais reecrit ; un proprietaire n'est ni desactive ni supprime.
#
# Partie 1 (toujours, sans base) : client pg simule.
# Partie 2 (si MANAGE_SUPER_ADMIN_TEST_DB_URL pointe une base JETABLE ou les
# migrations du lot sont appliquees) : le vrai cycle activer, revoquer,
# reactiver, avec le temoin du declencheur.
# Sortie : ^manage-super-admin: N/N passed
set -euo pipefail
cd "$(dirname "$0")/../.."

node - <<'NODE'
const assert = require('assert');
const ops = require('./scripts/lib/super-admin-ops.cjs');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`ok - ${name}`); };

/** Client simule : journal des requetes, et une reponse par motif. */
function fakePg(ligne, { rowCount = 1, autres = 0 } = {}) {
  const sql = [];
  return {
    sql,
    query: async (text, params) => {
      sql.push({ text: text.replace(/\s+/g, ' ').trim(), params });
      if (/^SELECT au\.id/.test(text.trim())) return { rows: ligne ? [ligne] : [], rowCount: ligne ? 1 : 0 };
      if (/^SELECT count/.test(text.trim())) return { rows: [{ n: autres }], rowCount: 1 };
      if (/^(UPDATE|DELETE)/.test(text.trim())) return { rows: [], rowCount };
      return { rows: [], rowCount: 0 };
    },
  };
}
const plateforme = { user_id: 'u1', role: 'super_admin', postes: [], is_super_admin: true };
const proprietaire = { user_id: 'u2', role: 'owner', postes: ['owner'], is_super_admin: true };
const ecritures = (pg) => pg.sql.filter((q) => /^(UPDATE|DELETE)/.test(q.text));

(async () => {
  await check('transaction : BEGIN, reglage local de session, puis COMMIT', async () => {
    const pg = fakePg(plateforme);
    await ops.revoquer(pg, 'a@b.c', 'resto');
    assert.strictEqual(pg.sql[0].text, 'BEGIN');
    assert.strictEqual(pg.sql[1].text, "SELECT set_config('request.jwt.claim.role', 'service_role', true)");
    assert.strictEqual(pg.sql[pg.sql.length - 1].text, 'COMMIT');
  });

  await check('chaque ecriture cible email ET restaurant', async () => {
    for (const op of [ops.revoquer, ops.activer]) {
      const pg = fakePg(plateforme);
      await op(pg, 'a@b.c', 'resto');
      const [w] = ecritures(pg);
      assert.match(w.text, /email = \$1 AND tenant_id = \(SELECT id FROM tenants WHERE slug = \$2\)/);
      assert.deepStrictEqual(w.params, ['a@b.c', 'resto']);
    }
  });

  await check('role n est jamais reecrit', async () => {
    for (const ligne of [plateforme, proprietaire]) {
      for (const op of [ops.revoquer, ops.activer]) {
        const pg = fakePg(ligne);
        await op(pg, 'a@b.c', 'resto');
        for (const w of ecritures(pg)) assert.doesNotMatch(w.text, /\brole\s*=/);
      }
    }
  });

  await check('revocation d une ligne de plateforme : drapeau et desactivation', async () => {
    const pg = fakePg(plateforme);
    await ops.revoquer(pg, 'a@b.c', 'resto');
    assert.match(ecritures(pg)[0].text, /SET is_super_admin = false, is_active = false WHERE/);
  });

  await check('revocation d un proprietaire : le drapeau seul, jamais desactive', async () => {
    const pg = fakePg(proprietaire);
    await ops.revoquer(pg, 'a@b.c', 'resto');
    assert.match(ecritures(pg)[0].text, /SET is_super_admin = false WHERE/);
    assert.doesNotMatch(ecritures(pg)[0].text, /is_active/);
  });

  await check('activation d une ligne de plateforme : la reactive (revoquer puis reactiver marche)', async () => {
    const pg = fakePg({ ...plateforme, is_super_admin: false, is_active: false });
    await ops.activer(pg, 'a@b.c', 'resto');
    assert.match(ecritures(pg)[0].text, /SET is_super_admin = true, is_active = true, deleted_at = NULL WHERE/);
  });

  await check('zero ou plusieurs lignes touchees : ROLLBACK, pas de COMMIT', async () => {
    for (const rowCount of [0, 2]) {
      const pg = fakePg(plateforme, { rowCount });
      await assert.rejects(ops.revoquer(pg, 'a@b.c', 'resto'), /attendu 1/);
      assert.strictEqual(pg.sql[pg.sql.length - 1].text, 'ROLLBACK');
      assert.ok(!pg.sql.some((q) => q.text === 'COMMIT'));
    }
  });

  await check('ligne introuvable dans ce restaurant : rien n est ecrit', async () => {
    const pg = fakePg(null);
    await assert.rejects(ops.activer(pg, 'a@b.c', 'resto'), /0 ligne/);
    assert.strictEqual(ecritures(pg).length, 0);
    assert.strictEqual(pg.sql[pg.sql.length - 1].text, 'ROLLBACK');
  });

  await check('suppression refusee pour un proprietaire, rien n est supprime', async () => {
    const pg = fakePg(proprietaire);
    await assert.rejects(ops.supprimer(pg, 'a@b.c', 'resto'), /proprietaire/);
    assert.strictEqual(ecritures(pg).length, 0);
  });

  await check('suppression : rend le nombre de lignes restantes du compte', async () => {
    const pg = fakePg(plateforme, { autres: 1 });
    assert.deepStrictEqual(await ops.supprimer(pg, 'a@b.c', 'resto'), { userId: 'u1', lignesRestantes: 1 });
    assert.match(ecritures(pg)[0].text, /^DELETE FROM admin_users WHERE email = \$1 AND tenant_id/);
  });

  await check('le script s arrete sans SUPER_ADMIN_TENANT_SLUG', async () => {
    const { spawnSync } = require('child_process');
    const res = spawnSync('node', ['scripts/manage-super-admin.js', 'status'], {
      env: {
        PATH: process.env.PATH,
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
        SUPABASE_SERVICE_ROLE_KEY: 'x',
        DATABASE_URL: 'postgresql://x:y@127.0.0.1:1/z',
      },
      encoding: 'utf8',
    });
    assert.strictEqual(res.status, 1);
    assert.match(res.stderr, /SUPER_ADMIN_TENANT_SLUG manquant/);
  });

  // ------------------------------------------------------------------ banc
  const url = process.env.MANAGE_SUPER_ADMIN_TEST_DB_URL;
  if (url) {
    const { Client } = require('pg');
    const pg = new Client({ connectionString: url });
    await pg.connect();
    const q = (text, params) => pg.query(text, params);
    const estSuper = async (userId) => {
      await q('BEGIN');
      await q("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal1' })]);
      await q("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
      const r = await q('SELECT public.is_super_admin() AS ok');
      await q('ROLLBACK');
      return r.rows[0].ok;
    };
    const T1 = 'aaaa0001-0000-0000-0000-000000000001', T2 = 'aaaa0002-0000-0000-0000-000000000002';
    const UP = 'bbbb0001-0000-0000-0000-000000000001', UO = 'bbbb0002-0000-0000-0000-000000000002';
    const MAIL = 'plateforme@essai.test';
    try {
      await q('BEGIN');
      await q("SELECT set_config('request.jwt.claim.role', 'service_role', true)");
      await q("INSERT INTO public.tenants (id, slug, name) VALUES ($1,'msa-plateforme','P'),($2,'msa-resto','R')", [T1, T2]);
      await q('INSERT INTO auth.users (id, email) VALUES ($1,$3),($2,$4)', [UP, UO, MAIL, 'patron@essai.test']);
      // Le MEME email dans deux restaurants : une seule ligne doit etre touchee.
      await q(`INSERT INTO public.admin_users (user_id, tenant_id, email, role, is_super_admin, is_active) VALUES
                ($1,$3,$5,'super_admin',true,true), ($2,$4,'patron@essai.test','owner',true,true)`, [UP, UO, T1, T2, MAIL]);
      await q("INSERT INTO auth.users (id, email) VALUES ('bbbb0003-0000-0000-0000-000000000003','double@essai.test')");
      await q(`INSERT INTO public.admin_users (user_id, tenant_id, email, role, is_active) VALUES
                ('bbbb0003-0000-0000-0000-000000000003',$1,$2,'waiter',true)`, [T2, MAIL]);
      await q('COMMIT');

      await check('banc : cycle revoquer, reactiver sur la ligne de plateforme', async () => {
        assert.strictEqual(await estSuper(UP), true);
        await ops.revoquer(pg, MAIL, 'msa-plateforme');
        assert.strictEqual(await estSuper(UP), false);
        await ops.activer(pg, MAIL, 'msa-plateforme');
        assert.strictEqual(await estSuper(UP), true);
      });

      await check('banc : le reglage de session ne survit pas a la transaction', async () => {
        const r = await q("SELECT coalesce(current_setting('request.jwt.claim.role', true), '') AS v");
        assert.strictEqual(r.rows[0].v, '');
      });

      await check('banc, temoin : sans le reglage, le declencheur refuse toujours', async () => {
        await ops.revoquer(pg, MAIL, 'msa-plateforme');
        // Une session sans jeton (comme le script, connecte en direct) : les
        // revendications sont un objet vide, pas une chaine vide.
        await q('BEGIN');
        await q("SELECT set_config('request.jwt.claims', '{}', true)");
        await assert.rejects(
          q("UPDATE public.admin_users SET is_super_admin = true WHERE email = $1 AND tenant_id = $2", [MAIL, T1]),
          /Only super_admin users can grant super_admin privileges/,
        );
        await q('ROLLBACK');
        await ops.activer(pg, MAIL, 'msa-plateforme');
      });

      await check('banc : meme email dans deux restaurants, une seule ligne touchee', async () => {
        await ops.revoquer(pg, MAIL, 'msa-plateforme');
        const r = await q('SELECT is_active, role, postes FROM public.admin_users WHERE email = $1 AND tenant_id = $2', [MAIL, T2]);
        assert.deepStrictEqual(r.rows[0], { is_active: true, role: 'waiter', postes: ['waiter'] });
        await ops.activer(pg, MAIL, 'msa-plateforme');
      });

      await check('banc : un proprietaire portant le drapeau reste proprietaire actif', async () => {
        await ops.revoquer(pg, 'patron@essai.test', 'msa-resto');
        assert.strictEqual(await estSuper(UO), false);
        await ops.activer(pg, 'patron@essai.test', 'msa-resto');
        assert.strictEqual(await estSuper(UO), true);
        const r = await q("SELECT role, postes, is_active FROM public.admin_users WHERE email = 'patron@essai.test'");
        assert.deepStrictEqual(r.rows[0], { role: 'owner', postes: ['owner'], is_active: true });
        await assert.rejects(ops.supprimer(pg, 'patron@essai.test', 'msa-resto'), /proprietaire/);
      });
    } finally {
      await q('ROLLBACK').catch(() => {});
      await q('DELETE FROM public.tenants WHERE id IN ($1,$2)', [T1, T2]).catch(() => {});
      await q("DELETE FROM auth.users WHERE email LIKE '%@essai.test'").catch(() => {});
      await pg.end();
    }
  }

  console.log(`manage-super-admin: ${passed}/${passed} passed`);
})().catch((err) => { console.error(err); process.exit(1); });
NODE
