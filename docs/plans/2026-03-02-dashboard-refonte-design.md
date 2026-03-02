# Refonte Dashboard Admin ATTABL

**Date** : 2026-03-02
**Inspiration** : Finance Dashboard (Notion Budget & Finance 2026)
**Statut** : Approuve

## Contexte

Le dashboard actuel est compose de :

- Un hero banner avec 3 mini KPIs (commandes, CA, items actifs)
- Une grille de navigation (AdminHomeGrid) avec tuiles vers les sections

Problemes identifies :

- Trop vide, les donnees sont fetchees mais pas affichees (recentOrders, stockItems, categoryBreakdown, hourlyOrders)
- Design pas assez professionnel
- Pas assez actionnable pour le restaurateur

## Design cible

Structure inspiree du Finance Dashboard Notion : barre KPI horizontale, sections en 2 colonnes, grille de categories colorees, tableau de donnees.

### Section 1 : Barre KPI horizontale

5 cartes cote a cote, scrollable horizontalement sur mobile :

| Carte          | Icone       | Donnee                     | Sous-texte                      |
| -------------- | ----------- | -------------------------- | ------------------------------- |
| CA du jour     | DollarSign  | revenueToday formatte      | tendance revenueTrend % vs hier |
| Commandes      | ShoppingBag | ordersToday                | tendance ordersTrend % vs hier  |
| Items actifs   | Package     | activeItems                | "sur le menu"                   |
| Tables actives | LayoutGrid  | activeCards (venues)       | "occupees"                      |
| Panier moyen   | TrendingUp  | revenueToday / ordersToday | par commande                    |

Style : fond subtil different par carte (accent/10, emerald/10, etc.), icone a gauche, valeur en gras XXL, tendance en badge.

### Section 2 : Layout 2 colonnes

**Colonne gauche — "Vue d'ensemble"**

- CA total du jour en grand + tendance % J-1
- Nombre de commandes en attente (status = 'pending')
- Mini sparkline du CA sur 7 jours (revenueSparkline)
- Bouton CTA "Voir les commandes" ou "Nouveau POS"

**Colonne droite — "Commandes recentes"**

- 3 dernieres commandes en cartes
- Chaque carte : numero table + montant + statut (badge colore) + heure relative
- Fleche ">" pour acceder au detail
- Lien "Voir toutes les commandes" en bas

### Section 3 : Layout 2 colonnes

**Colonne gauche — "Categories populaires"**

- Grille 2x3 de cartes colorees (comme Budget Tracking)
- Chaque carte : nom categorie + nombre de commandes + indicateur tendance
- Couleurs distinctes par categorie
- Donnees depuis categoryBreakdown

**Colonne droite — "Top items"**

- Tableau scrollable
- Colonnes : Rang, Nom item, Quantite vendue, CA genere
- Top 5-8 items depuis initialPopularItems
- Avatar image si disponible (image_url)

### Section 4 : Acces rapides

- Titre "Acces rapides"
- Grille AdminHomeGrid existante, conservee telle quelle
- Adaptee au type d'etablissement (restaurant, hotel, bar, etc.)

## Donnees

Toutes les donnees necessaires sont deja fetchees dans :

- `page.tsx` (Server Component) : initialStats, initialRecentOrders, initialPopularItems
- `useDashboardData` hook : stats, recentOrders, stockItems, categoryBreakdown, hourlyOrders, sparklines
- Realtime via Supabase channels (orders + ingredients)

Donnees manquantes a ajouter :

- **Tables actives** : ajouter le count des tables avec commandes en cours (ou reutiliser activeCards/venues)
- **Panier moyen** : calcul simple revenueToday / ordersToday
- **Commandes en attente** : filtrer orders par status = 'pending' (deja dans recentOrders)

## Composants a modifier

| Fichier                                    | Action                                              |
| ------------------------------------------ | --------------------------------------------------- |
| `src/components/admin/DashboardClient.tsx` | Refonte complete du rendu                           |
| `src/components/admin/StatsCard.tsx`       | Adapter pour la barre KPI horizontale               |
| `src/components/admin/AdminHomeGrid.tsx`   | Ajouter titre "Acces rapides", conserver la logique |
| `src/app/sites/[site]/admin/page.tsx`      | Passer les nouvelles props si necessaire            |
| `src/hooks/useDashboardData.ts`            | Ajouter panier moyen si besoin                      |

## Theme et style

- Respecter le design system existant (variables CSS : --accent, --app-card, --app-border, etc.)
- Support dark/light theme (deja en place via ThemeProvider)
- Cartes categories avec couleurs subtiles (accent/10, emerald/10, amber/10, etc.)
- Typographie : valeurs en font-black, labels en uppercase tracking-widest
- Responsive : scroll horizontal sur mobile pour la barre KPI, colonnes stackees en mobile
