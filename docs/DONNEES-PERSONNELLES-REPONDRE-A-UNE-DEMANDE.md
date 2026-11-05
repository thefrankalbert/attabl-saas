# Repondre a une demande sur les donnees personnelles

La politique de confidentialite annonce un droit d'acces, de rectification, de
suppression et de portabilite, et renvoie vers une adresse de contact. Traiter ces
demandes **a la main** est admis - le delai de reference est d'un mois - mais il faut
pouvoir le faire sans ecrire du SQL a chaud sur la production.

Ce document est la procedure. L'outil est `scripts/exporter-donnees-personnelles.sh`.

> Ce depot est **public**. Aucune donnee personnelle ne doit y figurer : ni dans un
> fichier, ni dans un message de commit, ni dans une capture. Le script refuse
> d'ecrire a l'interieur du depot, mais la vigilance reste la votre.

## 1. Verifier l'identite du demandeur - AVANT tout

C'est la premiere etape, pas une formalite. Livrer un export a quelqu'un qui se fait
passer pour un restaurateur, c'est livrer les donnees de ce restaurateur a son
concurrent. La demande doit provenir de l'adresse enregistree dans le compte, ou etre
confirmee par un autre canal deja connu.

## 2. Exporter

```bash
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)"

# Une personne (par son adresse email)
./scripts/exporter-donnees-personnelles.sh --email adresse@exemple.com --sortie ~/demandes/42

# Un restaurant (par son slug)
./scripts/exporter-donnees-personnelles.sh --tenant mon-resto --sortie ~/demandes/43
```

Le script produit un fichier JSON par table non vide, plus `manifeste.json`.

**Conserver le manifeste.** Il horodate la demande, liste **toutes** les tables
parcourues - y compris celles a zero ligne - et le nombre de lignes trouvees. C'est lui
qui prouve, plus tard, qu'on a cherche partout et quand on a repondu.

### Ce que le script garantit

- **Lecture seule, garantie par PostgreSQL** : chaque requete tourne dans une
  transaction `READ ONLY`. Une ecriture accidentelle est refusee par la base
  (`cannot execute UPDATE in a read-only transaction`), pas seulement par prudence.
- **Il refuse d'ecrire dans le depot**, qui est public.
- **Il refuse une valeur contenant du SQL** (quote, point-virgule, tiret double).
- **Il echoue** si une table ou une colonne a disparu, plutot que de produire un
  fichier vide qu'on prendrait pour "aucune donnee".

### Le piege que ce script evite

Les cles etrangeres de ce schema sont **melangees** : certaines colonnes `user_id` et
`created_by` pointent vers `auth.users(id)`, d'autres vers `public.admin_users(id)`, et
quatre tables n'ont aucune contrainte. Une recherche sur le seul identifiant de compte
rend un export qui a l'air complet mais manque les invitations envoyees, les
encaissements saisis et les mouvements de stock.

Le script interroge donc l'**union** des identifiants de la personne (son compte, plus
toutes ses lignes `admin_users` - une par restaurant). Deux UUID distincts ne se
confondent pas : l'union n'ajoute aucun faux positif et ne manque rien.

## 3. Supprimer

Il n'existe volontairement **pas** de script de suppression : une suppression est
irreversible et depend de ce qui peut legalement etre conserve. Elle se fait a la main,
apres l'export, et dans cet ordre.

### Avant de supprimer quoi que ce soit

1. **Exporter d'abord** (etape 2) et garder l'export : c'est la seule trace de ce qui a
   ete supprime.
2. **Verifier la sauvegarde du jour.** Supabase sauvegarde quotidiennement sur le plan
   Pro, avec 7 jours d'historique. Au-dela, la suppression est definitive.
3. **Distinguer ce qui doit etre conserve.** Les commandes et les encaissements ont une
   valeur comptable et fiscale. Dans la plupart des cas, la bonne reponse n'est pas de
   les effacer mais de les **anonymiser** : vider `orders.customer_name`,
   `orders.customer_phone` et `orders.delivery_address`, en gardant la ligne et ses
   montants.

### Ce qui se supprime, ce qui s'anonymise

| Table                                                                      | Geste                                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `newsletter_subscriber`                                                    | supprimer                                                                                                                 |
| `push_subscriptions`, `notifications`, `user_preferences`, `user_sessions` | supprimer                                                                                                                 |
| `invitations` non acceptees                                                | supprimer                                                                                                                 |
| `orders`                                                                   | **anonymiser** les colonnes client, garder la ligne                                                                       |
| `payments`, `stock_movements`, `stock_counts`, `order_notes`               | garder (valeur comptable); `created_by` peut etre mis a `null`                                                            |
| `admin_users`                                                              | desactiver (`is_active = false`, `deleted_at`) plutot que supprimer : la ligne est referencee par les ecritures ci-dessus |
| `audit_log`, `platform_audit_log`                                          | garder; ce sont des journaux de securite                                                                                  |

### Apres

- Relancer l'export sur le meme sujet : il doit montrer ce qui reste, et c'est la
  verification que la suppression a porte.
- Consigner la date et le perimetre a cote du manifeste.
- Les donnees subsistent dans les **sauvegardes** pendant 7 jours. C'est normal et
  admis, mais il faut le savoir et pouvoir le dire au demandeur.

## 4. Ce que ce document ne couvre pas

Les obligations declaratives (loi camerounaise n°2024/017, loi burkinabe n°001-2021, et
la declaration prealable de transfert de donnees a l'etranger - les donnees sont
hebergees en Irlande) relevent d'un avocat, pas de cette procedure.
