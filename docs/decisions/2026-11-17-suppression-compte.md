# Suppression de compte depuis l'application : décisions produit

_17 novembre 2026 · branche `feat/suppression-compte` · exigence Apple App Store 5.1.1(v)_

Chaque personne connectée peut supprimer son compte depuis l'application, avec une confirmation explicite. Ce document fixe les choix qui ne relèvent pas du code mais du produit. **Les décisions 1 à 4 sont à confirmer par le propriétaire d'ATTABL.**

## Où se trouve la suppression

| Qui          | Où                                                            | Confirmation                                |
| ------------ | ------------------------------------------------------------- | ------------------------------------------- |
| Propriétaire | Menu du compte → **Mon compte** (aussi Paramètres → Sécurité) | Taper le nom du restaurant                  |
| Personnel    | Menu du compte → **Mon compte**, et la page `/unauthorized`   | Taper « SUPPRIMER » (« DELETE » en anglais) |

Le volet « Mon compte » reste ouvert quand le restaurant est gelé : le proxy renvoie alors tout vers `/subscription`, où le shell et ce volet sont disponibles. Le personnel d'un restaurant gelé n'atteint que `/unauthorized` (il n'a pas le droit d'ouvrir `/subscription`), d'où la présence de la suppression sur cette page.

## Décision 1 : N'importe quel propriétaire ferme le restaurant pour tous

Un restaurant peut avoir plusieurs propriétaires. **N'importe lequel d'entre eux** peut le fermer, et la fermeture vaut pour toute l'équipe, autres propriétaires compris. L'écran le dit en clair avant la confirmation.

Ce qui se passe :

- le restaurant est fermé **tout de suite** (`tenants.deleted_at`) ;
- **tous** les abonnements Stripe encore vivants de son client Stripe sont annulés, _avant_ la fermeture. Un échec Stripe laisse le restaurant ouvert, pour ne jamais facturer un restaurant fermé ; un abonnement marqué pour un autre restaurant (`metadata.tenant_id`) n'est jamais touché ;
- Flutterwave n'a pas de prélèvement automatique : le cron de renouvellement ignore déjà les restaurants supprimés ;
- les données du restaurant et les comptes de ses membres sont effacés **au bout de 30 jours** par la purge de conservation ;
- les **autres** restaurants du même propriétaire restent ouverts, et son compte reste actif pour eux.

Après l'annulation Stripe, le super-administrateur ne peut plus restaurer le restaurant tel quel : l'abonnement n'est plus utilisable.

## Décision 2 : Le chemin du personnel efface tout de suite

Pour un membre du personnel, « supprimer mon compte » supprime le **compte entier**, dans tous les restaurants où il travaille :

- toutes ses appartenances sont retirées et **anonymisées immédiatement** (nom, e-mail, téléphone) : le délai de 30 jours ne s'applique pas ;
- ses tables encore attribuées sont libérées ;
- ses sessions sont coupées et son compte de connexion est effacé.

Conséquence assumée : **aucune restauration n'est possible**. Pour revenir, il faut un nouveau compte et une nouvelle invitation. Le motif d'un éventuel bannissement (`ban_reason`) est conservé : ce n'est pas une donnée de contact, c'est la trace d'une sanction.

Deux refus : un compte plateforme (super-administrateur, sur n'importe quelle ligne) ne se supprime jamais par ce chemin, et le propriétaire d'un restaurant encore ouvert doit d'abord le fermer.

Dans les historiques (commandes, notes, tickets cuisine), un membre dont le nom a été effacé apparaît comme « Membre de l'équipe ».

## Décision 3 : Limite : 3 essais par heure et par compte

Les deux chemins partagent le compartiment destructif `adminResetLimiter` (fail-closed), avec une clé propre à chaque compte : `account-deletion:<user_id>`. Le budget est donc séparé de la remise à zéro des données.

## Décision 4 : Les commandes hors ligne en attente sont effacées

Après la suppression, l'appareil est nettoyé de force (caches, file hors ligne) avant le retour à la connexion. Des commandes encaissées hors ligne et pas encore envoyées sur **cet appareil** sont donc perdues. Rien de local ne doit survivre à un compte qui n'existe plus, et la file serait sinon rejouée plus tard sous une autre identité.
