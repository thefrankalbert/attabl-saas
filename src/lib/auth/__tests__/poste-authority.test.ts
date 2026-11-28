import { describe, expect, it } from 'vitest';
import {
  canActOnMember,
  canGrantPostes,
  canManageInvitationRights,
  type TeamActor,
  type TeamTarget,
} from '../poste-authority';
import { getEffectiveLevels, type MemberRights, type PosteOverrides } from '@/lib/permissions';
import { STAFF_POSTES, type Poste } from '@/types/permission.types';

/**
 * Autorite sur l'equipe (remplace l'ancien rang lineaire des roles).
 * SECURITE : ces regles empechent l'escalade (se donner un droit qu'on n'a
 * pas) et la prise de controle d'un compte de meme niveau ou du proprietaire.
 */
const actor = (id: string, member: MemberRights, overrides?: PosteOverrides): TeamActor => ({
  id,
  isOwner: member.postes.includes('owner'),
  levels: getEffectiveLevels(member, overrides),
});
const target = (id: string, member: MemberRights, overrides?: PosteOverrides): TeamTarget => ({
  id,
  postes: member.postes,
  levels: getEffectiveLevels(member, overrides),
});

const owner = actor('o', { postes: ['owner'] });
const manager = actor('m', { postes: ['manager'] });
const cashier = actor('c', { postes: ['cashier'] });

describe('canGrantPostes : on ne donne pas un droit qu on n a pas', () => {
  it('jamais owner, pour personne (proprietaire compris)', () => {
    expect(canGrantPostes(owner.levels, ['owner'])).toBe(false);
    expect(canGrantPostes(owner.levels, ['manager', 'owner'])).toBe(false);
    expect(canGrantPostes(manager.levels, ['owner'])).toBe(false);
  });

  it('jamais une liste vide', () => {
    expect(canGrantPostes(owner.levels, [])).toBe(false);
  });

  it.each(STAFF_POSTES)('le proprietaire donne le poste %s', (poste) => {
    expect(canGrantPostes(owner.levels, [poste])).toBe(true);
  });

  it('le gerant donne tout poste, gerant compris (il detient ces droits), et un cumul', () => {
    for (const poste of STAFF_POSTES) expect(canGrantPostes(manager.levels, [poste])).toBe(true);
    expect(canGrantPostes(manager.levels, ['waiter', 'cashier'])).toBe(true);
  });

  it('un caissier a qui l on a donne team.manage ne donne ni gerant ni chef', () => {
    const levels = getEffectiveLevels({
      postes: ['cashier'],
      permission_overrides: { 'team.manage': true },
    });
    expect(canGrantPostes(levels, ['manager'])).toBe(false);
    expect(canGrantPostes(levels, ['chef'])).toBe(false); // menu.edit, qu'il n'a pas
    // Temoin : il donne un poste dont il detient tous les droits.
    expect(canGrantPostes(levels, ['sales'])).toBe(true);
  });

  it('un gerant prive d un droit ne donne pas un poste qui le porte', () => {
    const levels = getEffectiveLevels({
      postes: ['manager'],
      permission_overrides: { 'orders.pay': false },
    });
    expect(canGrantPostes(levels, ['cashier'])).toBe(false);
    expect(canGrantPostes(levels, ['cook'])).toBe(true);
  });

  it('les reglages du restaurant comptent : un poste elargi ne se donne plus', () => {
    // Le proprietaire a donne `billing.manage` au poste serveur (cas d'ecole) :
    // le gerant, qui ne l'a qu'en niveau borne, ne peut plus donner ce poste.
    const overrides: PosteOverrides = { waiter: { 'billing.manage': true } };
    expect(canGrantPostes(manager.levels, ['waiter'], overrides)).toBe(false);
    expect(canGrantPostes(manager.levels, ['waiter'])).toBe(true);
    expect(canGrantPostes(owner.levels, ['waiter'], overrides)).toBe(true);
  });
});

describe('canActOnMember : jamais le proprietaire, jamais soi, jamais un pair', () => {
  const targets: [string, Poste[]][] = [
    ['un serveur', ['waiter']],
    ['un caissier', ['cashier']],
    ['un chef', ['chef']],
    ['un cumul caissier et serveur', ['cashier', 'waiter']],
  ];

  it.each(targets)('le gerant agit sur %s', (_label, postes) => {
    expect(canActOnMember(manager, target('t', { postes }))).toBe(true);
  });

  it('personne n agit sur le proprietaire, pas meme lui', () => {
    const ownerRow = target('o', { postes: ['owner'] });
    expect(canActOnMember(manager, ownerRow)).toBe(false);
    expect(canActOnMember(owner, ownerRow)).toBe(false);
    expect(canActOnMember(actor('o2', { postes: ['owner'] }), ownerRow)).toBe(false);
  });

  it('personne n agit sur soi-meme', () => {
    expect(canActOnMember(manager, target('m', { postes: ['waiter'] }))).toBe(false);
    expect(canActOnMember(owner, target('o', { postes: ['manager'] }))).toBe(false);
  });

  it('un gerant n agit pas sur un autre gerant (droits egaux, pas strictement inclus)', () => {
    expect(canActOnMember(manager, target('m2', { postes: ['manager'] }))).toBe(false);
  });

  it('temoin : le proprietaire agit sur ce meme gerant et sur tous les autres', () => {
    expect(canActOnMember(owner, target('m2', { postes: ['manager'] }))).toBe(true);
    for (const [, postes] of targets) {
      expect(canActOnMember(owner, target('t', { postes }))).toBe(true);
    }
  });

  it('un gerant n agit pas sur un gerant qui paie l abonnement (un droit de plus que lui)', () => {
    const richer = target('m2', {
      postes: ['manager'],
      permission_overrides: { 'billing.manage': true },
    });
    expect(canActOnMember(manager, richer)).toBe(false);
    // Et l'inverse passe : ses droits contiennent strictement ceux du gerant simple.
    const richerActor = actor('m2', {
      postes: ['manager'],
      permission_overrides: { 'billing.manage': true },
    });
    expect(canActOnMember(richerActor, target('m', { postes: ['manager'] }))).toBe(true);
  });

  it('un caissier n agit ni sur un chef ni sur un serveur (droits non inclus)', () => {
    expect(canActOnMember(cashier, target('t', { postes: ['chef'] }))).toBe(false);
    // Le serveur a `orders.pay` en niveau borne, le caissier en entier, et rien
    // de plus : ses droits sont strictement inclus dans ceux du caissier.
    expect(canActOnMember(cashier, target('t', { postes: ['waiter'] }))).toBe(true);
    expect(canActOnMember(cashier, target('t', { postes: ['cashier'] }))).toBe(false);
  });

  it('les reglages du restaurant comptent dans la comparaison', () => {
    const overrides: PosteOverrides = { waiter: { 'billing.manage': true } };
    expect(canActOnMember(manager, target('t', { postes: ['waiter'] }, overrides))).toBe(false);
  });
});

// Audit regression M3 : annuler ou renvoyer une invitation suit la regle pour
// DONNER (inclus ou egal), pas la regle pour agir sur un membre (strict).
describe('canManageInvitationRights : qui pouvait envoyer l invitation peut la defaire', () => {
  const invited = (member: MemberRights) => getEffectiveLevels(member);

  it('un gerant gere l invitation d un gerant (il peut en inviter un)', () => {
    expect(canManageInvitationRights(manager, invited({ postes: ['manager'] }))).toBe(true);
    // Temoin de coherence : c'est bien un poste qu'il peut donner.
    expect(canGrantPostes(manager.levels, ['manager'])).toBe(true);
  });

  it('un gerant ne gere PAS une invitation qui porte un droit qu il n a pas', () => {
    const withBilling = invited({
      postes: ['manager'],
      permission_overrides: { 'billing.manage': true },
    });
    expect(canManageInvitationRights(manager, withBilling)).toBe(false);
    // Temoin : le proprietaire la gere.
    expect(canManageInvitationRights(owner, withBilling)).toBe(true);
  });

  it('sans team.manage, personne ne gere une invitation, meme inferieure', () => {
    expect(canManageInvitationRights(cashier, invited({ postes: ['cook'] }))).toBe(false);
    const cashierWithTeam = actor('c2', {
      postes: ['cashier'],
      permission_overrides: { 'team.manage': true, 'team.view': true },
    });
    // Avec team.manage : un caissier gere l'invitation d'un caissier, pas d'un chef.
    expect(canManageInvitationRights(cashierWithTeam, invited({ postes: ['sales'] }))).toBe(true);
    expect(canManageInvitationRights(cashierWithTeam, invited({ postes: ['chef'] }))).toBe(false);
  });
});
