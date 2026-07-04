# ATTABL - Restaurant demo "L'Epicurien"

Ce document sert a preparer et derouler une demo client. Il decrit le restaurant
fictif, les identifiants de connexion, et le parcours a montrer - avec un focus sur
la gestion de stock, notre coeur de metier.

**Page de presentation client (a projeter/partager) :**
https://claude.ai/code/artifact/8e94306a-40de-46c1-ac97-3855a41ccdff

> Le restaurant demo est un tenant isole. Toute donnee y est fictive. On peut le
> reinitialiser a tout moment avec `pnpm seed:demo` (voir la fin du document).

---

## 1. Le restaurant

**L'Epicurien** - restaurant africain, N'Djamena (Tchad).

- Plan **Business**, devise **FCFA (XAF)**, TVA 19,25%, service 10%.
- 3 espaces (Terrasse, Salle, VIP), ~15 tables.
- Une carte complete de cuisine africaine : **54 plats dans 10 categories** (entrees,
  brochettes et grillades, poissons, volailles, plats en sauce, riz et feculents,
  specialites du Tchad, desserts, jus naturels, sodas/bieres/vins). **Chaque plat a sa
  photo, sa description, ses prix et ses details** (allergenes, vegetarien, epice).
- Une equipe de 6 personnes (patron, chef, manager, caissiere, 2 serveurs).
- 90 jours de commandes, des commandes en cours aujourd'hui, et un stock qui tourne
  en temps reel (recettes qui deduisent les ingredients a chaque commande).

**Adresse de la demo :** `https://lepicurien.attabl.com`

---

## 2. Se connecter

Un seul compte a donner au client (patron du restaurant) :

| Champ        | Valeur                  |
| ------------ | ----------------------- |
| Email        | `owner@demo.attabl.com` |
| Mot de passe | `DemoAttabl2026`        |

Autres comptes disponibles (meme mot de passe `DemoAttabl2026`) pour montrer les roles
et les droits differents :

| Role    | Email                      | Personne       |
| ------- | -------------------------- | -------------- |
| Chef    | `chef@demo.attabl.com`     | Fatime Hassan  |
| Manager | `manager@demo.attabl.com`  | Ousmane Kabore |
| Caisse  | `caisse@demo.attabl.com`   | Mariam Toure   |
| Serveur | `serveur1@demo.attabl.com` | Ali Mahamat    |
| Serveur | `serveur2@demo.attabl.com` | Aicha Ndiaye   |

> Compte demo uniquement. Aucun acces plateforme (pas de super-admin). Ne pas utiliser
> pour de vraies donnees.

---

## 3. Le pitch en une phrase

Avant : carnet, calculette, tickets perdus entre la salle et la cuisine, un stock
qu'on decouvre vide un vendredi soir. Avec ATTABL : la commande part du telephone,
arrive en cuisine en temps reel, le stock se met a jour tout seul, et le patron voit
son chiffre du jour depuis son telephone.

---

## 4. Parcours de demo (ordre conseille)

Duree ~12 minutes. Commencer large (le tableau de bord), finir sur le stock (ce qui
nous distingue).

### Etape 1 - Le tableau de bord (la photo du restaurant)

Ouvrir `lepicurien.attabl.com` connecte en patron.

- Montrer le chiffre d'affaires du jour et la courbe des 30 derniers jours.
- Montrer les tables occupees, les commandes en cours, les plats les plus vendus.
- Message : "En un coup d'oeil, vous savez ou vous en etes. Sans Excel."

### Etape 2 - La caisse (prendre une commande en direct)

Aller dans Caisse. Prendre une commande, choisir une table, encaisser.

- Message : "Chaque vente est enregistree. Cash, carte, mobile money."
- Bien insister : cette commande va tout de suite bouger le stock (etape 5).

### Etape 3 - L'espace Service (la salle en temps reel)

Aller dans Service. La table qu'on vient de servir apparait **occupee**.

- Montrer l'affectation d'un serveur a une table, les commandes pretes a servir.
- Message : "Le serveur sait quelle table est libre, qui a commande quoi, sans crier
  entre la salle et la cuisine."

### Etape 4 - Le menu et l'equipe

- Menu : montrer les categories, un plat, son prix, sa zone (cuisine ou bar).
- Equipe : montrer les 6 collaborateurs, leurs roles, les droits differents (un
  serveur ne voit pas la compta).
- Message : "Vous gerez qui fait quoi. Chacun voit ce qui le concerne."

### Etape 5 - LE STOCK (le coeur - prendre son temps ici)

C'est notre difference. Derouler dans cet ordre :

1. **Inventaire** : la liste des ingredients, leur quantite, leur cout. Montrer un
   ingredient **en alerte** (sous le seuil) - le systeme le signale tout seul.
2. **Fiches techniques (recettes)** : ouvrir un plat, montrer ses ingredients et les
   quantites. "C'est ca qui fait la magie : chaque plat vendu deduit ses ingredients."
3. **Historique du stock** : montrer les mouvements. On voit les sorties liees aux
   commandes (le stock qui tourne), les receptions fournisseur, les ajustements.
   Revenir sur la commande de l'etape 2 : son ingredient a bien baisse.
4. **Fournisseurs + reception** : montrer une reception. Insister sur la conversion
   d'unite : "Vous achetez en casier de 24, le systeme convertit en bouteilles tout
   seul." (note automatique "Recu: 2 casier (48 bouteille)").
5. **Pertes / Analyse** : montrer les pertes par raison (perime, casse, vol,
   renverse, prep). "Vous savez ou part la marge. Un chiffre, pas une intuition."
6. **Comptage physique** : montrer un inventaire cloture avec un ecart. "Vous comptez
   le reel, le systeme calcule l'ecart avec le theorique. Le vol se voit."
7. **Rapport par employe (antivol)** : chaque sortie de stock porte le nom de qui l'a
   faite. "La responsabilite est tracee."

Message de fin : "Le stock n'est plus une devinette. Chaque plat vendu, chaque perte,
chaque livraison est comptee. Vous arretez de perdre de l'argent sans savoir ou."

---

## 5. Arguments chiffres (a verifier en live sur le tableau de bord)

- Chiffre d'affaires : plusieurs millions de FCFA par mois (au-dessus de 500 000
  garantis par le seed sur 30 jours glissants).
- Un stock qui bouge a chaque commande, pas une saisie manuelle du soir.
- Les pertes chiffrees par raison - de l'argent qu'on arrete de perdre a l'aveugle.
- Un ecart d'inventaire visible - le vol et l'erreur ne passent plus inapercus.

---

## 6. Reinitialiser / recreer le restaurant demo

Le seed est idempotent : il efface le tenant `lepicurien` (et ses comptes) puis le
recree a neuf.

```bash
pnpm seed:demo
```

Prerequis : `.env.local` renseigne (le script ecrit dans la base pointee par
`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). En fin d'execution, le
script verifie et affiche le chiffre d'affaires seede (30 jours glissants) et echoue
s'il est sous 500 000 FCFA.

> Attention : il n'existe qu'une base Supabase (prod). Lancer ce script ecrit le
> tenant demo directement en prod. C'est voulu (la demo doit etre publique a
> lepicurien.attabl.com), mais a lancer en connaissance de cause.
