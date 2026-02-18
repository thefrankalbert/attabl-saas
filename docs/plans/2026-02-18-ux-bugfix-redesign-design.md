# ATTABL Admin — UX Bugfix & Redesign Premium

**Date:** 2026-02-18
**Approche:** Sequentielle par priorite (A: bugs, B+D: i18n/textes, C: design)
**Inspirations:** Toast POS, Square for Restaurants, Lightspeed Restaurant

---

## Principes de design

- **Flat design** : zero ombres portees, bordures fines `border-neutral-200`
- **Espacement aere** : `gap-6`, `p-6`, pas de surcharge visuelle
- **Couleur accent** : `#CCFF00` (lime ATTABL) uniquement pour CTA et elements actifs
- **Formulaires premium** : labels au-dessus des champs, `rounded-lg`, focus ring lime
- **Cards propres** : fond blanc, bordure `1px solid neutral-100`, zero ombre
- **Pas de scroll inutile** : les pages doivent tenir dans la viewport quand possible

---

## Categorie A — Bugs bloquants

### A1. Page Rapports — erreur au chargement

- **Cause probable** : `useReportData` crash quand il n'y a pas de donnees en base
- **Fix** : gardes null/empty dans le hook + etats vides elegants ("Aucune donnee pour cette periode")
- **Fichiers** : `src/hooks/queries/useReportData.ts`, `src/components/admin/ReportsClient.tsx`

### A2. Permissions — erreur a la sauvegarde

- **Cause probable** : upsert direct client-side dans `role_permissions` sans RLS policy
- **Fix** : creer une API route `/api/permissions` (server-side) + verifier RLS policies
- **Fichiers** : `src/app/sites/[site]/admin/settings/permissions/page.tsx`, nouveau `src/app/api/permissions/route.ts`

### A3. POS encaissement — erreur lors de la commande

- **Cause probable** : champs manquants (table_number = "inconnue", pas de venue_id)
- **Fix** : validation cote client avant soumission + messages d'erreur clairs + fallback table_number
- **Fichiers** : `src/components/admin/POSClient.tsx`, `src/components/admin/PaymentModal.tsx`

### A4. Sons — "Impossible de jouer le son"

- **Cause probable** : fichiers `.mp3` references mais absents de `/public/sounds/`
- **Fix** : ajouter 4-5 vrais fichiers audio (clochette, ding, buzzer, chime — sons libres de droits de la gastronomie)
- **Fichiers** : `public/sounds/*.mp3`, `src/components/admin/settings/SoundSettings.tsx`

### A5. Upload logo — ne fonctionne pas

- **Cause probable** : handler file input present mais upload vers Supabase Storage manquant
- **Fix** : implementer upload reel vers Supabase Storage bucket `tenant-logos` + afficher preview
- **Fichiers** : `src/components/admin/settings/SettingsForm.tsx`

### A6. Commandes detail — texte technique `order.warning`

- **Cause** : cles i18n manquantes pour les statuts de commande
- **Fix** : ajouter traductions dans les 8 fichiers de messages
- **Fichiers** : `src/messages/*.json`, `src/components/admin/OrderDetails.tsx`

---

## Categorie B+D — Textes techniques + i18n

### B1. Permissions — supprimer codes techniques

- Supprimer la colonne `font-mono` qui affiche `menu.view`, `orders.manage` etc.
- Garder uniquement les labels humains ("Voir le menu", "Gerer les commandes")
- Regrouper par categorie avec separateurs visuels (Menu, Commandes, Rapports, Caisse, Inventaire, Equipe, Parametres)
- **Fichiers** : `src/app/sites/[site]/admin/settings/permissions/page.tsx`

### B2. Extraire 32+ strings hardcodees vers i18n

- Permission labels (12 strings) → `permissions.label.*`
- Role labels (6 strings) → `permissions.role.*`
- UI strings (15+ strings) → `permissions.title`, `permissions.subtitle`, etc.
- **Fichiers** : `src/app/sites/[site]/admin/settings/permissions/page.tsx`, `src/messages/*.json` (8 fichiers)

### B3. Corriger accents manquants dans fr-FR.json

- `reports.thisYear` : "Cette annee" → "Cette annee" (avec accent)
- `reports.vsLastPeriod` : "vs. periode precedente" → avec accents
- `reports.categoryBreakdown` : "Repartition par categorie" → avec accents
- `reports.noCategories` : "Aucune donnee de categorie" → avec accents
- `reports.csvDownloaded` : "CSV telecharge" → "CSV telecharge" (avec accent)
- Meme corrections dans fr-CA.json
- **Fichiers** : `src/messages/fr-FR.json`, `src/messages/fr-CA.json`

### B4. Statuts de commande — cles i18n manquantes

- Ajouter traductions pour `order.readyToServe`, `order.warning`, etc.
- Verifier que `room_service` est traduit en francais ("Service en chambre")
- **Fichiers** : `src/messages/*.json`

---

## Categorie C — Refonte UX/Design

### C1. Sidebar — bouton Parametres

- Retirer la section "Administration" (Settings, Users, QR Codes, Tables, Permissions, Reports, Stock History, Subscription) du sidebar
- Ajouter un bouton gear icon dans le footer du sidebar, a cote de Deconnexion
- Ce bouton navigue vers `/sites/[site]/admin/settings` qui contient les sous-pages en onglets
- Sous-pages : General, Equipe, Tables, Permissions, QR Codes, Abonnement
- Garder Reports et Stock History dans le sidebar principal (section "Analyse")
- **Fichiers** : `src/components/admin/AdminSidebar.tsx`

### C2. Parametres — onglets horizontaux

- Remplacer la page scrollable par des onglets horizontaux en haut
- Onglets : Identite | Personnalisation | Facturation | Sons | Securite | Contact | Langue
- Chaque onglet affiche une section sans scroll
- Style : tabs shadcn/ui avec indicateur lime actif
- **Fichiers** : `src/components/admin/settings/SettingsForm.tsx`

### C3. Dashboard — layout fixe sans scroll

- Grille fixe viewport-height :
  - Rangee 1 : 4 KPI cards (Commandes, Revenus, Articles actifs, Cartes) — `grid-cols-4`
  - Rangee 2 : Graphique revenus (2/3) + Actions rapides (1/3)
  - Rangee 3 : Commandes recentes (2/3) + Alertes stock (1/3)
- Tout visible sans scroller
- Cards sans ombre, bordure fine, coins arrondis
- **Fichiers** : `src/components/admin/DashboardClient.tsx`

### C4. POS — Modal encaissement redesign

- Layout 2 colonnes : recapitulatif a gauche, paiement a droite
- Pave numerique compact (3x4 grille : 1-9, 0, 00, backspace)
- Champ pourboire avec boutons rapides (5%, 10%, 15%, Personnalise)
- Affichage clair : Montant du → Montant recu → Monnaie a rendre → Pourboire
- Numero de commande propre (pas "# 1 — Table inconnue")
- **Fichiers** : `src/components/admin/PaymentModal.tsx`

### C5. Page Service — redesign

- Corriger contraste texte (pas blanc sur fond gris)
- Remplacer le menu deroulant ovale par un select standard shadcn/ui
- Layout propre avec cards pour chaque table/serveur
- **Fichiers** : `src/components/admin/ServiceManager.tsx`, `src/components/admin/ServerDashboard.tsx`

### C6. QR Codes — onglets libres

- Navigation par onglets cliquables (Choisir | Personnaliser | Telecharger) — pas de sequentiel
- On peut cliquer directement sur n'importe quel onglet
- Supprimer toutes les ombres des cards
- Ajouter format A4 dans les options d'export
- Page sans scroll (tout dans la viewport)
- **Fichiers** : `src/app/sites/[site]/admin/qr-codes/QRCodePage.tsx`

### C7. Formulaires globaux — design uniforme premium

- Toutes les modals de creation/edition : design uniforme
- Labels clairs au-dessus des champs
- Inputs : `rounded-lg`, bordure `neutral-200`, focus `ring-lime-400`
- Boutons d'action en bas a droite
- Modals plus larges avec padding genereux (`max-w-2xl` minimum)
- Calendrier : date picker shadcn/ui natif
- **Fichiers concernes** :
  - `src/components/admin/MenusClient.tsx`
  - `src/components/admin/CategoriesClient.tsx`
  - `src/components/admin/ItemsClient.tsx`
  - `src/components/admin/CouponsClient.tsx`
  - `src/components/admin/AnnouncementsClient.tsx`
  - `src/components/admin/SuggestionsClient.tsx`
  - `src/components/admin/SuppliersClient.tsx`
  - `src/components/admin/RecipesClient.tsx`
  - `src/components/admin/InventoryClient.tsx`

### C8. Vue detail article — panneau lateral

- Cliquer sur un article ouvre un slide-over a droite
- Contenu : image, nom, description, prix, categorie, allergenes, options, variantes, recette liee
- **Fichiers** : `src/components/admin/ItemsClient.tsx`, nouveau `src/components/admin/ItemDetailPanel.tsx`

### C9. Commandes — clic sur ligne + redesign detail

- Cliquer n'importe ou sur la ligne = ouvrir le detail (pas seulement l'oeil)
- Redesign du modal de detail avec labels traduits et layout propre
- **Fichiers** : `src/components/admin/OrdersClient.tsx`, `src/components/admin/OrderDetails.tsx`

### C10. Drag-and-drop categories

- Reparer le systeme de reordonnement des categories
- Utiliser `@dnd-kit/core` pour un drag-and-drop fonctionnel
- **Fichiers** : `src/components/admin/CategoriesClient.tsx`

### C11. Historique stocks — ameliorer esthetique

- Cards plus propres, meilleure utilisation de l'espace
- **Fichiers** : `src/components/admin/StockHistoryClient.tsx`

### C12. Abonnement — ameliorer esthetique

- Redesign avec cards de plans, comparaison features, boutons CTA lime
- **Fichiers** : `src/app/sites/[site]/admin/subscription/page.tsx`

### C13. Tables — ameliorer esthetique cartes et modals

- Cards de tables plus propres (flat, pas d'ombre)
- Modals d'ajout avec meilleur espacement
- **Fichiers** : `src/app/sites/[site]/admin/settings/tables/page.tsx`

### C14. Permissions — redesign matrice

- Supprimer les codes techniques visibles
- Regrouper par categorie avec separateurs
- Bouton "Restaurer" par role (pas global)
- Design premium de la matrice
- **Fichiers** : `src/app/sites/[site]/admin/settings/permissions/page.tsx`

---

## Fichiers impactes (resume)

| Categorie  | Nombre de fichiers                       | Complexite |
| ---------- | ---------------------------------------- | ---------- |
| A (Bugs)   | ~10 fichiers                             | Moyenne    |
| B+D (i18n) | ~10 fichiers (8 messages + 2 composants) | Faible     |
| C (Design) | ~20 fichiers                             | Haute      |
| **Total**  | **~35 fichiers uniques**                 | —          |

---

## Ordre d'execution

1. **Phase 1 — Bugs** (A1-A6) : 6 taches
2. **Phase 2 — i18n** (B1-B4) : 4 taches
3. **Phase 3 — Design structurel** (C1-C2, C3) : sidebar + settings + dashboard
4. **Phase 4 — Design composants** (C4-C14) : POS, service, QR, formulaires, etc.
