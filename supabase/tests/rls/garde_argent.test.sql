-- L'ARGENT ne se delegue pas avec les commandes.
--
-- POURQUOI CE TEST EXISTE. 20261107170000 a rendu la garde d'ecriture sensible
-- aux delegations du proprietaire. C'etait le but, mais cela ouvrait un ecart
-- que l'application n'a jamais permis: elle separe l'argent du reste par le
-- ROLE (ORDER_MONEY_ROLES, owner/admin/manager), pas par la permission, alors
-- que la base n'avait qu'une permission pour les deux. Un caissier a qui le
-- proprietaire accorde `orders.manage` pouvait donc, via PostgREST, inserer
-- une ligne NEGATIVE dans `payments` (aucune contrainte de signe), poser
-- `payment_status = 'comp'`, ou solder un compte maison.
--
-- Ce test prouve la DISTINCTION, pas un simple refus. Un caissier delegue doit
-- continuer a faire son metier - encaisser, faire avancer une commande - et
-- doit etre refuse sur l'argent. Les deux moities comptent autant: un test qui
-- ne verifierait que le refus laisserait passer un correctif qui bloque la
-- caisse.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/garde_argent.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('b1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-delegue@test.local', 'x', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-argent@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('b3333333-3333-3333-3333-333333333333', 'tenant-argent', 'Tenant Argent', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b1111111-1111-1111-1111-111111111111', 'caissier-delegue@test.local', 'cashier', true),
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b2222222-2222-2222-2222-222222222222', 'gerant-argent@test.local', 'manager', true);

-- Le proprietaire delegue `orders.manage` au CAISSIER, par l'interface des
-- permissions. C'est tout l'interet du cas: sans cette delegation, la base le
-- refuserait de toute facon et le test ne prouverait rien.
insert into public.role_permissions (tenant_id, role, permissions)
values ('b3333333-3333-3333-3333-333333333333', 'cashier',
        '{"orders.manage": true}'::jsonb);

insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status)
values ('b4444444-4444-4444-4444-444444444444', 'b3333333-3333-3333-3333-333333333333',
        'CMD-ARGENT-1', 10000, 10000, 'preparing', 'pending');

insert into public.house_accounts (id, tenant_id, name)
values ('b5555555-5555-5555-5555-555555555555', 'b3333333-3333-3333-3333-333333333333',
        'Compte temoin');

-- ===========================================================================
-- Le CAISSIER DELEGUE fait TOUJOURS son metier
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111"}';

update public.orders set status = 'ready'
where id = 'b4444444-4444-4444-4444-444444444444';
select is(
  (select status from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  'ready',
  'argent: un caissier DELEGUE fait toujours avancer une commande'
);

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('b3333333-3333-3333-3333-333333333333',
            'b4444444-4444-4444-4444-444444444444', 10000, 'cash', 'completed')$$,
  'argent: un caissier DELEGUE encaisse toujours un tender POSITIF'
);

update public.orders set payment_status = 'paid'
where id = 'b4444444-4444-4444-4444-444444444444';
select is(
  (select payment_status from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  'paid',
  'argent: un caissier DELEGUE marque toujours une commande payee'
);

-- ===========================================================================
-- Mais il n a AUCUNE autorite sur l argent
-- ===========================================================================
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('b3333333-3333-3333-3333-333333333333',
            'b4444444-4444-4444-4444-444444444444', -5000, 'cash', 'refunded')$$,
  '42501',
  null,
  'argent: un caissier delegue ne peut PAS inserer un montant NEGATIF'
);

-- Ces deux refus LEVENT une erreur, ils ne masquent pas la ligne. La garde
-- argent est dans le WITH CHECK, qui porte sur la ligne RESULTANTE: une
-- violation de WITH CHECK est une erreur 42501. Le USING de cette policy,
-- lui, reste `orders.manage`, que le caissier delegue satisfait - il peut
-- donc bien VISER la ligne, c'est son contenu resultant qui est refuse.
-- (Un refus par USING, comme sur house_accounts plus bas, masque la ligne et
-- ne leve rien: les deux formes existent et ne s'assertent pas pareil.)
select throws_ok(
  $$update public.orders set payment_status = 'comp', is_comp = true
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  'argent: un caissier delegue ne peut PAS offrir une commande'
);

select throws_ok(
  $$update public.orders set payment_status = 'refunded'
    where id = 'b4444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  'argent: un caissier delegue ne peut PAS marquer une commande remboursee'
);

select throws_ok(
  $$insert into public.house_accounts (tenant_id, name)
    values ('b3333333-3333-3333-3333-333333333333', 'Compte pirate')$$,
  '42501',
  null,
  'argent: un caissier delegue ne peut PAS ouvrir un compte maison'
);

update public.house_accounts set name = 'pirate'
where id = 'b5555555-5555-5555-5555-555555555555';
select is(
  (select name from public.house_accounts where id = 'b5555555-5555-5555-5555-555555555555'),
  'Compte temoin',
  'argent: un caissier delegue ne peut PAS modifier un compte maison'
);

-- ===========================================================================
-- Le GERANT garde l autorite argent
-- ===========================================================================
set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222"}';

update public.orders set payment_status = 'comp', is_comp = true
where id = 'b4444444-4444-4444-4444-444444444444';
select is(
  (select payment_status from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  'comp',
  'argent: un manager OFFRE toujours une commande'
);

select * from finish();
rollback;
