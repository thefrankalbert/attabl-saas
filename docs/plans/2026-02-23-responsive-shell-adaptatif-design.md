# Design: Shell Adaptatif Responsive — ATTABL SaaS

**Date**: 2026-02-23
**Score cible**: 4/10 → 8/10
**Scope**: 6 étapes, ~40 fichiers, ~6000 lignes refactorées

## Contexte

ATTABL est un SaaS multi-tenant B2B pour restaurants/hôtels. L'interface admin doit fonctionner sur 3 form factors:

- **Mobile (<768px)**: Serveurs en service (une main, debout)
- **Tablette (768-1024px)**: Chefs en cuisine (paysage, gants)
- **Desktop (>1024px)**: Managers en bureau

## Architecture Cible

### Shell 3 Modes

```
MOBILE: TopBar + Content + BottomNav (5 items filtrés par rôle)
TABLET: CollapsedSidebar (w-16) + Content
DESKTOP: ExpandedSidebar (w-64) + Content
```

### Nouveaux Fichiers (Infrastructure)

```
src/
  lib/layout/
    breakpoints.ts              # Constantes sm/md/lg/xl
    navigation-config.ts        # NAV_GROUPS extraits de AdminSidebar
  contexts/
    DeviceContext.tsx            # Détecte mobile/tablet/desktop via matchMedia
  hooks/
    useDevice.ts                # Hook wrapper pour DeviceContext
    queries/useRolePermissions.ts  # React Query hook pour role_permissions
  components/admin/
    sidebar/
      SidebarHeader.tsx         # Logo, tenant name, collapse toggle
      SidebarNav.tsx            # Groupes + items + filtering
      NavGroup.tsx              # Groupe collapsible avec chevron
      NavItem.tsx               # Item avec icon, label, badge, tooltip
      SidebarFooter.tsx         # User info, settings, logout
      index.ts                  # Re-exports
    AdminBottomNav.tsx          # Bottom nav mobile pour admin
```

### Fichiers Modifiés

```
src/components/admin/
  AdminSidebar.tsx              # Réduit à ~150L (composition)
  AdminLayoutClient.tsx         # Basculer sidebar/collapsed/bottom-nav selon device
  DashboardClient.tsx           # Grid responsive + chart heights
  KitchenClient.tsx             # Boutons 44px+, spacing responsive
  POSClient.tsx                 # Panier responsive, boutons h-10
  DataTable.tsx                 # Mode card mobile, colonnes masquables
  PaymentModal.tsx              # Stack vertical mobile
```

## Approche par Étape

1. **Infrastructure** (4 nouveaux fichiers) — DeviceContext, useDevice, breakpoints, nav-config
2. **Refactor AdminSidebar** (7 nouveaux + 1 modifié) — Découpage en sous-composants
3. **Fix Composants Critiques** (5 modifiés) — Dashboard, KDS, POS, DataTable, touch targets
4. **Extraire Pages Monolithiques** (~12 nouveaux + 3 modifiés) — Tables, Permissions, Settings
5. **Shell Adaptatif** (3 nouveaux + ~15 modifiés) — ViewMode, BottomNav admin, layout adaptatif
6. **Composants Adaptatifs** (~10 modifiés) — Vues dédiées par device

## Principes

- Mobile-first CSS (base = mobile, md: = tablet, lg: = desktop)
- Touch targets minimum 44x44px sur tout bouton/lien interactif
- Pas de virtualisation (YAGNI) — juste du responsive CSS + conditionnel JS léger
- Garder compatibilité avec le système de permissions existant (3-level)
- Un commit par étape pour traçabilité
