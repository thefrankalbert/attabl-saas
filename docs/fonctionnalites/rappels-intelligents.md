# Rappels intelligents

Inspirés de ce que fait Airbnb pour ses hôtes : prévenir **la bonne personne**, **au bon moment**, **seulement s'il reste quelque chose à faire**.

## Les principes

1. **Un rappel n'existe que si l'action est encore possible.** Juste avant chaque envoi, le moteur revérifie dans la base que le problème existe toujours.
2. **Il disparaît tout seul.** Dès que le problème est réglé (commande servie, lancée), le rappel est clos et retiré de la cloche dans la minute.
3. **Il va à la personne qui peut agir.** Le serveur de la commande ou de la table, la cuisine. Le responsable n'est prévenu qu'en escalade, au double du délai.
4. **On regroupe.** Une même personne ne reçoit pas deux rappels de la même règle à moins de 2 minutes d'intervalle : les commandes en attente partent ensemble (« 3 commandes prêtes attendent »).
5. **On n'affirme que ce qu'on a mesuré.** Le bilan du lundi ne donne que des faits tirés des commandes du restaurant, avec la période et le nombre de commandes. Sous 4 semaines d'activité et 80 commandes, il se tait.
6. **Chacun garde la main.** Le restaurant choisit les règles et les délais (Paramètres, onglet Rappels). Chaque personne peut couper un rappel pour elle depuis sa cloche, et le réactiver au même endroit.
7. **Rien n'est supprimé automatiquement.** Les mesures de chaque règle remontent dans la console de la plateforme (onglet Rappels). La décision d'ajuster ou d'arrêter une règle revient à l'administration.

## Les règles

| Règle                        | Quand                                                                                              | Qui                                                                                                                                               | Données utilisées                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commande prête, pas servie   | 3 min après le passage à « prête » (réglable de 2 à 30) ; escalade au double                       | Le serveur qui a pris la commande et celui à qui la table est attribuée ; sinon les responsables. Escalade : propriétaire, administrateur, gérant | `orders.ready_at` (nouveau, rempli par un déclencheur)                                                                                                                          |
| Commande reçue, pas lancée   | 5 min après la création (réglable de 3 à 60) ; escalade au double                                  | Les comptes « cuisine » ; sans compte cuisine, les responsables                                                                                   | `orders.created_at`, statut `pending` ou `confirmed`                                                                                                                            |
| Avant l'ouverture : le stock | 30 minutes avant l'ouverture (la veille au soir pour une ouverture vers minuit), une fois par jour | Propriétaire, administrateur, gérant                                                                                                              | Horaires du restaurant, ingrédients épuisés ou sous leur seuil d'alerte, plats retirés de la carte. Rien n'est envoyé si tout va bien ou si les horaires ne sont pas renseignés |
| Le bilan du lundi            | Le lundi à 9 h, une fois par semaine                                                               | Propriétaire et administrateur                                                                                                                    | Les 4 dernières semaines de commandes : créneau (jour, heure) le plus chargé en moyenne, plats vendus au moins 2 fois par semaine avant et plus du tout la semaine dernière     |

Toutes les heures sont celles **du restaurant**, déduites de son pays (`src/lib/timezones.ts`). Le Cameroun, le Tchad et le Gabon sont en UTC+1, le Burkina, la Côte d'Ivoire et le Sénégal en UTC+0.

Le moteur ne regarde que les **3 dernières heures** d'activité : une commande oubliée depuis des jours dans la base est de l'historique, pas un problème de service en cours. Un rappel resté ouvert plus de 6 heures (commande jamais marquée servie) quitte la cloche et compte « non réglé » dans les mesures.

Les textes partent dans **la langue du restaurant** (`tenants.default_locale`, français par défaut, anglais pour un restaurant anglophone).

## La précision

Le moteur tourne **chaque minute** (tâche Vercel `/api/cron/reminders`, protégée par `CRON_SECRET`). Un rappel « prête depuis 3 min » part donc entre 3 et 4 minutes après le passage à « prête ». Le regroupement peut ajouter jusqu'à 2 minutes pour une commande qui rejoint un envoi récent (le délai est compté par niveau : une escalade n'attend jamais derrière un rappel ordinaire).

Les rappels à heure fixe (avant le service, bilan du lundi) sont évalués pendant 3 minutes : assez pour survivre à un passage manqué de la tâche, sans relancer des lectures lourdes chaque minute. Si l'envoi échoue (cloche ou base indisponible), la réservation est libérée et le passage suivant réessaie.

## Les canaux

- **La cloche de l'application** (centre de notifications), avec une icône dédiée et le bouton « Ne plus recevoir ce rappel ».
- **La notification push** sur le téléphone. Pour les rappels de service, elle vibre, sonne de nouveau et reste affichée jusqu'à ce que la personne la touche. Le comportement exact dépend du téléphone : non vérifié sur un appareil réel.
- **WhatsApp n'est pas utilisé pour les rappels.** Les messages envoyés automatiquement par un logiciel passent par l'offre professionnelle de Meta, facturée au message (environ 0,01 dollar en Afrique, à confirmer sur la grille de Meta). WhatsApp sert au **service client** : un bouton « Écrire sur WhatsApp » et un bouton « Appeler » sur la page d'aide. C'est gratuit, parce que c'est le restaurateur qui écrit ou qui appelle.

## Les mesures (console de la plateforme, onglet Rappels)

Pour chaque règle, sur 30 jours :

- le nombre de rappels envoyés et de restaurants concernés ;
- pour les rappels de service : les escalades, la part réglée en moins de 5 minutes, le temps médian pour régler ;
- pour les rappels à heure fixe : la part ouverte par le destinataire ;
- le nombre de personnes qui l'ont coupé.

## Les tables

Migration `supabase/migrations/20261115120000_rappels_intelligents.sql`, purement additive :

- `orders.ready_at` et son déclencheur ;
- `reminders` : journal des envois, avec une clé unique qui interdit d'envoyer deux fois le même rappel ;
- `reminder_settings` : réglages du restaurant, modifiables seulement avec le droit `settings.edit` ;
- `reminder_preferences` : les rappels coupés par chaque personne ;
- trois fonctions de calcul (`reminder_coach_slots`, `reminder_coach_items`, `reminder_rule_stats`) qui rendent des totaux calculés en base. L'API ne renvoie jamais plus de 1000 lignes : lire les commandes une par une faussait le bilan d'un restaurant actif. Réservées au moteur et à la console (service_role), elles ne sont pas appelables par l'API publique.

Les droits sont vérifiés par `supabase/tests/rls/rappels_intelligents.test.sql`.

**Ordre de mise en production** : appliquer la migration, puis déployer le code. Le code tolère l'absence des tables (la console affiche un onglet vide, la tâche journalise l'erreur), mais les rappels ne partent qu'une fois les tables présentes.

## Les fichiers

- `src/services/reminders/rules.ts` : les règles, fonctions pures.
- `src/services/reminders/messages.ts` : les textes.
- `src/services/reminders/reminder.service.ts` : le moteur.
- `src/services/reminders/reminder-delivery.ts` : anti-doublon, cloche, push.
- `src/services/reminders/reminder-facts.ts` : lecture du stock et des commandes du bilan.
- `src/services/reminders/reminder-stats.ts` : les mesures de la console.
- `src/app/api/cron/reminders/route.ts` : la tâche planifiée.
- `src/components/admin/settings/ReminderSettingsPanel.tsx` : l'onglet Rappels.
- `src/lib/support-contact.ts` : le numéro du support (provisoire), à un seul endroit.
- `tests/integration/reminders/engine.test.ts` : le moteur entier sur une vraie base locale (`pnpm test:db`).
