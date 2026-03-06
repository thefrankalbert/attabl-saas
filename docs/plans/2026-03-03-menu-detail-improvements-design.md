# Menu Detail Page Improvements - Design

## Summary

Refonte de la page detail menu (MenuDetailClient) pour supprimer la redondance, ajouter l'edition inline + modal, fixer le tri et le scroll.

## Changes

### 1. Supprimer la carte header redondante

- Supprimer le bloc `bg-app-card` qui repete le nom du menu
- Garder le breadcrumb existant + ajouter le toggle actif/inactif inline a cote

### 2. Tri par display_order (pas alphabetique)

- Remplacer `.order('name', { ascending: true })` par `.order('display_order', { ascending: true })` dans :
  - `src/app/sites/[site]/admin/menus/[menuId]/page.tsx` (ligne 53)
  - `src/components/admin/MenuDetailClient.tsx` (ligne 95 dans loadData)
  - `src/services/menu.service.ts` (ligne 303 dans getItemsForMenu)

### 3. Edition inline du prix

- Clic sur le prix -> champ input editable
- Validation au blur ou Enter
- Update optimiste (state local puis sync DB)

### 4. Modal d'edition complete pour les items

- Bouton crayon sur chaque item -> modal avec : Nom, Description, Prix, toggle Stock
- Pas de champs EN dans la modal (gere par la langue de l'interface)

### 5. Toggle visibilite categories

- Ajouter un toggle oeil sur chaque categorie (utilise le champ `is_active` existant)
- Categories desactivees apparaissent grises

### 6. Toggle visibilite items

- Le toggle stock existant reste
- Ajouter un toggle oeil pour la visibilite

### 7. Fix bug de scroll

- Updates optimistes pour eviter le re-render complet
- `loadData()` uniquement pour operations structurelles (ajout/suppression)
- Les toggles et edits inline modifient le state local immediatement

## Files to modify

- `src/components/admin/MenuDetailClient.tsx` (principal)
- `src/app/sites/[site]/admin/menus/[menuId]/page.tsx` (tri)
- `src/services/menu.service.ts` (tri)
