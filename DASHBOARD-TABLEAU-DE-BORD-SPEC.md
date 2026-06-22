# ATTABL - Dashboard "Tableau de bord" : Spec + Brief de refonte

Page auditee : `/sites/[site]/admin` (accueil admin tenant). Source : code + live (:3001) + capture 1440x846.
But du document : (1) presentation claire de toutes les features/options de la page, (2) brief de refonte visuelle alignee marche + plus stable (corriger les incoherences).

---

## 1. Vue d'ensemble

La page = **chrome admin** (sidebar gauche + topbar) + **contenu Tableau de bord**.

```
AdminLayoutClient (h-dvh, 1 seul main#main-content scrollable)
  Sidebar (224px / 68px collapse, >= lg uniquement)
  TopBar (52px : recherche/Cmd+K, notifications, dark-mode, fullscreen)
  main
    DashboardClient
      Header (salutation + date/heure live + actions QR/Rapports/Stock)
      MetricsRow (4 KPI : CA jour, Plats actifs, Commandes jour, Tables actives)
      Grille : [ Vue d'ensemble (chart) + Plats les plus commandes ]  |  [ Alertes stock (conditionnel) + Commandes recentes (live) ]
  AdminBottomNav (mobile/tablette uniquement)
```

Fichiers cles : `DashboardClient.tsx`, `dashboard/MetricsRow.tsx`, `dashboard/OverviewChart.tsx`, `dashboard/TopDishesCard.tsx`, `dashboard/LiveOrdersFeed.tsx`, `dashboard/StockAlertsCard.tsx`, `AdminSidebar.tsx`, `AdminTopBar.tsx`, `useDashboardData.ts`, `lib/design-tokens.ts`, `globals.css`.

---

## 2. Inventaire des features / options

### 2.1 Chrome - Sidebar gauche

- **Marque tenant** : carre logo 26px + nom ("La Parisienne") + domaine mono `{slug}.attabl.com`.
- **Changer d'espace** : popover listant les tenants de l'utilisateur (multi-tenant) -> `router.push('/sites/{slug}/admin')`. Point pulsant accent. (Disparait quand sidebar repliee - pas d'equivalent icone.)
- **Sections de nav** (source unique `navigation-config.ts` -> `NAV_GROUPS`) :
  - OPERATIONS : Tableau de bord, Commandes, Caisse (POS), Cuisine (KDS), Service.
  - CATALOGUE : Cartes & Menus, Categories, Plats.
  - MARKETING : Annonces, Coupons, Suggestions.
  - (Groupe ANALYSE = Rapports, Historique stock, Factures, Journaux d'audit + Inventaire/Recettes/Fournisseurs -> **PAS dans la sidebar**, seulement dans le popover compte / Cmd+K.)
- **Footer** : barre d'usage "Commandes / mois N%" (progress) + carte compte "Admin BluTable - plan PREMIUM" (ouvre popover : Reglages, Abonnement, Support, theme, Inventaire/Recettes/Fournisseurs, Analyse, Deconnexion + QR perso) + bouton "Reduire" (collapse, persiste localStorage).

### 2.2 Chrome - TopBar (52px)

- **Recherche / Cmd+K** : pilule "Rechercher une page" + badge `⌘K` -> ouvre la **Command Palette** (cmdk) : Quick Actions (nouvelle commande, ajouter plat, inviter - selon permissions) + Navigation (tous les items). Permission-gated.
- **Notifications** : cloche + badge compteur (jusqu'a 99+), dropdown 320px, Supabase realtime + son a la nouvelle notif.
- **Dark-mode** : toggle (lune). **NON FONCTIONNEL** (voir incoherences).
- **Plein ecran** : toggle, persiste sessionStorage.
- Fil d'ariane a gauche (cache sur l'accueil).

### 2.3 Contenu - Header de page

- Salutation contextuelle ("Bon apres-midi") selon l'heure, nom utilisateur, sous-titre "voici votre journee".
- Ligne date/heure live (mono) + libelle "en temps reel" (horloge maj chaque 60s).
- Actions : **QR Codes** (-> /qr-codes), **Rapports** (-> /reports), **Historique stock** (-> /stock-history).

### 2.4 Contenu - MetricsRow (4 KPI, cliquables)

| KPI               | Donnee                                              | Detail                                     |
| ----------------- | --------------------------------------------------- | ------------------------------------------ |
| Chiffre du jour   | CA du jour (commandes `delivered`, total+pourboire) | redige `•••` si pas la permission finances |
| Plats actifs      | count `menu_items.is_available=true`                |                                            |
| Commandes du jour | count commandes du jour (tous statuts)              |                                            |
| Tables actives    | tables occupees / total                             | static apres SSR                           |

- Chaque carte : valeur + delta vs hier (▲/▼/●) + sparkline 7j + point "live" sur le CA.
- **Option** : cliquer une carte change la metrique du graphique "Vue d'ensemble".

### 2.5 Contenu - Vue d'ensemble (OverviewChart, lazy)

- **Options** : toggle Revenus/Commandes ; periode 7j/30j/90j ; tooltip au survol (date, valeur, delta% vs periode precedente).
- Aire + ligne periode courante (accent) + ligne pointillee periode precedente.
- Total de la plage affiche.

### 2.6 Contenu - Plats les plus commandes (TopDishesCard)

- Top 5 plats 7 jours (portions, revenus, prix moyen, categorie, statut DISPONIBLE/indispo, tendance sparkline).
- **Options** : recherche (nom/sous-ligne) ; onglets de filtre par categorie (Tout + categories dynamiques).
- Avatar initiales colore (couleur par index).

### 2.7 Contenu - Commandes recentes (LiveOrdersFeed, lazy, **vrai live**)

- 20 dernieres commandes : n0 commande, badge statut (EN ATTENTE/PREPARATION/PRET/LIVRE/ANNULEE), montant, table + items (3), age.
- **Options** : Pause/Reprendre le flux live ; clic ligne -> detail commande.
- Supabase realtime (INSERT/UPDATE/DELETE) -> maj KPI + flux. Flash a la nouvelle commande.

### 2.8 Contenu - Alertes stock (StockAlertsCard, conditionnel)

- 3 ingredients sous seuil (niveau warn/err). Lien "Voir tout le stock" -> /inventory.
- Cache si 0 alerte. (Donnees SSR, pas de maj live malgre le point pulsant.)

---

## 3. Incoherences relevees (le coeur de la refonte)

### A. Theme / couleur

1. **Dark-mode casse** : `sites/[site]/layout.tsx` force `forcedTheme="light"` sur tout le sous-arbre admin -> le toggle dark ne fait RIEN (le `class` reste `light`). Tokens dark complets mais inaccessibles.
2. **Accent incoherent dark vs light** : dark `--app-accent:#006aff` (bleu) mais `--app-accent-muted` reste lime ; light `--app-accent:#65a30d` (lime) mais `--app-accent-hover:#0055cc` (bleu). Rampe melangee bleu/lime = migration design inachevee.
3. **4 systemes de couleur coexistent** : tokens (`bg-app-*`), couleurs Tailwind nommees (`bg-indigo-600/rose-600/amber-600` dans TopDishes), RGBA brut (`border-[rgba(194,245,66,0.25)]`), alpha blanc (`bg-white/[0.015]` - casse en light). + couleurs en dur dans NotificationCenter (`text-blue-500/amber-500/green-500/red-500`).

### B. Typographie

4. **Tailles px en dur partout** (10/11/12/13/15/18/22px), aucune echelle nommee -> tout changement = chasse dans 5 fichiers.
5. **font-mono surutilise** (60%+ du texte, y compris labels, en-tetes de section, boutons segmented, recherche). Pas de regle semantique (mono devrait = chiffres/IDs uniquement).
6. **text-[10px] sur des elements interactifs** (labels de KPI cliquables, badges categorie/statut) -> viole la regle projet `03-responsive` (min text-xs).

### C. Espacement / composants

7. **Padding d'en-tete de carte incoherent** : `px-5 py-3.5` (Overview/Orders/Stock) vs `px-4 py-2.5` (TopDishes). Pas de token de carte unifie.
8. **Tailles d'icones melangees** : 14px/16px/w-3/w-3.5/20px selon l'element adjacent.
9. **3 tokens de hover** pour la meme intention : `hover:bg-app-elevated` / `bg-app-card` / `bg-app-hover`.
10. **3 systemes de badge de statut** : LiveOrdersFeed (STATUS_STYLES tokens) vs TopDishes (classes inline) vs StockAlerts (map locale). + **type OrderStatus divergent** (`admin.types` sans `confirmed`, `design-tokens` avec ; `cancelled` vs `canceled` -> fallback silencieux sur "pending").

### D. Touch / a11y

11. Cibles tactiles < 44px : bouton Pause 30px, icones 22-28px. + text-[10px] interactif.
12. **aria-label fullscreen fige** sur "minimize" (ne bascule pas). NotificationCenter : fallback SSR change de taille a l'hydratation + aria en dur anglais. OfflineIndicator + quelques chaines FR en dur (i18n manquant).

### E. Honnetete "temps reel" + affordances

13. **"en temps reel" trompeur** : seulement 2/6 sources se mettent a jour live (KPI stats + flux commandes). Graphique, sparklines KPI, top plats, tables, alertes stock = **SSR statiques**. Le point pulsant des Alertes stock suggere du live alors que c'est fige.
14. **Affordances cassees** : lignes "Plats les plus commandes" en `cursor-pointer` mais **aucun clic** ; texte "vs hier" (compareText) rendu **uniquement en sr-only** (invisible) ; champ de recherche TopDishes **plus etroit sur grand ecran** (180->140px).
15. **Chart** : SVG `preserveAspectRatio="none"` -> courbe distordue sur grand ecran ; pas de message "aucune donnee".

### F. Information Architecture (nav)

16. **Groupe ANALYSE absent de la sidebar** (Inventaire, Recettes, Fournisseurs, Rapports, Historique stock, Factures, Audit) -> releguies dans un popover secondaire.
17. **Filtrage par permission incoherent** : sidebar montre tout (pas de filtre role), Command Palette filtre, BottomNav filtre par segment seulement. 3 strategies differentes.

---

## 4. Brief de refonte (aligne marche + stable)

Objectif : un dashboard calme, dense mais lisible, coherent, du niveau **Toast / Square / Lightspeed** (POS resto) cote features et **Linear / Stripe / Vercel** cote discipline visuelle (tokens, echelle typo, un seul accent).

### 4.1 Fondations (a faire AVANT le visuel)

- **Un seul contrat de tokens semantiques** : surface/bg/elevated, text/secondary/muted, border, accent(+hover+muted+contrast), status(success/warning/error/info). Supprimer toutes les couleurs Tailwind nommees, RGBA bruts, alpha blanc. Une seule rampe d'accent coherente (decider : marque = lime `#65a30d`).
- **Decider le theme** : soit (a) admin clair only -> retirer le toggle dark mort ; soit (b) supporter le dark -> donner a l'admin son propre ThemeProvider (sans `forcedTheme`) + verifier tous les tokens dark. Recommandation : (b) avec accent unique sur les 2 themes.
- **Echelle typographique nommee** (ex. `label 11`, `caption 12`, `body 13`, `subtitle 15`, `title 20`, `display 28`) en tokens, zero `text-[Npx]` arbitraire. **font-mono reserve aux chiffres/montants/n0 de commande/IDs** ; en-tetes de section en sans (petites capitales).
- **Echelle d'espacement 4px** + un composant **Card** unique (radius, border, padding d'en-tete et de corps constants) + un set d'**icones** a tailles fixes (16 nav, 14 dense, 20 primaire).

### 4.2 Composants partages a creer

- `<StatBadge>` (delta ▲/▼ + "vs hier" VISIBLE), `<StatusBadge>` unique (un seul enum OrderStatus reconcilie), `<SectionCard>` (en-tete + actions + corps), `<Sparkline>`, `<Segmented>` unifie, `<MetricCard>`.

### 4.3 Honnetete des donnees

- Rendre live les 6 widgets (s'abonner + invalider buckets/tables/stock) OU afficher clairement quels widgets sont live (badge "live") et retirer le pulsant des donnees statiques. Ne pas afficher "en temps reel" globalement si faux.

### 4.4 Interactions / a11y

- Toutes cibles interactives >= 44px (ou 36 en mode dense desktop documente) ; jamais text-[10px] interactif.
- Lignes Top plats : cliquables (-> fiche plat) ou retirer `cursor-pointer`.
- aria-labels dynamiques ; tailles SSR stables ; 100% i18n (fr/en), ponctuation ASCII.
- Chart responsive sans distorsion + etat "aucune donnee".

### 4.5 Information architecture

- Promouvoir Analyse/Inventaire/Rapports/Factures en nav de 1er niveau (section dediee) ou nav secondaire claire.
- **Un seul** util de visibilite (`getVisibleNavItems` + permissions) partage par Sidebar / BottomNav / Command Palette.

### 4.6 References marche

- Toast / Square / Lightspeed (KPI resto, flux commandes live, top plats).
- Linear / Stripe / Vercel (densite calme, un accent, echelle typo stricte, tokens).

---

## 5. Resume pour prompt de refonte (a coller)

> Refonds le dashboard admin "Tableau de bord" d'un SaaS resto (Next.js 16 + Tailwind v4 + shadcn). Garde TOUTES les features (header salutation+actions QR/Rapports/Stock ; 4 KPI cliquables CA/Plats actifs/Commandes/Tables ; graphique Vue d'ensemble Revenus/Commandes 7-30-90j ; Top plats 7j avec recherche+filtres categorie ; flux Commandes recentes live avec pause ; alertes stock). Corrige : un seul systeme de tokens semantiques + un accent unique coherent dark/light ; echelle typo nommee (zero px arbitraire) ; font-mono limite aux chiffres ; un composant Card/Badge/Status unique ; cibles >= 44px ; aucun text-[10px] interactif ; honnetete "temps reel" (live = vraiment live ou label explicite) ; nav coherente avec filtrage permission unifie ; lignes Top plats cliquables ; chart responsive + etat vide ; dark-mode fonctionnel ou retire. Style cible : calme et dense type Linear/Stripe/Vercel, features type Toast/Square/Lightspeed.
