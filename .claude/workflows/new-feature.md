# Workflow : Developpement d'une Nouvelle Feature

## Quand utiliser ce workflow

Quand tu veux implementer une feature complete qui touche plusieurs couches du projet
(frontend, backend, base de donnees, tests). Les agents se coordonnent en parallele
avec un contrat API comme point de synchronisation.

---

## Phase 1 — Planification (session solo, pas d'Agent Team)

Avant de lancer l'equipe, definis les specs avec une session Claude Code normale :

```
Je veux implementer [description de la feature].
Pose-moi des questions pour bien comprendre les besoins avant de proposer un plan.
Ne commence pas a coder.
```

Laisse Claude te poser ses questions, reponds, puis demande-lui :

```
Maintenant, cree un plan d'implementation structure dans docs/plans/feature-[nom].md avec :
- User stories avec criteres d'acceptation
- Endpoints API necessaires (methode, path, request body, response)
- Changements de schema de base de donnees
- Composants UI a creer ou modifier
- Tests a ecrire
- Risques identifies
```

**Relis et valide ce plan AVANT de passer a la Phase 2.**

---

## Phase 2 — Backend + Database (en parallele)

```
Cree une equipe d'agents pour implementer la feature decrite dans docs/plans/feature-[nom].md.

Spawne 2 coequipiers :

1. Agent DBA avec le prompt :
"Tu es le Database Admin. Lis .claude/agents/database-admin.md et le plan dans
docs/plans/feature-[nom].md. Cree les migrations necessaires dans src/db/.
Les migrations doivent etre reversibles. Quand le schema est pret, envoie un message
a l'Agent Backend pour qu'il puisse commencer l'implementation des API."

2. Agent Backend avec le prompt :
"Tu es le Backend Developer. Lis .claude/agents/backend-developer.md et le plan dans
docs/plans/feature-[nom].md. ATTENDS le message de l'Agent DBA confirmant que les
migrations sont pretes. Ensuite, implemente les endpoints API decrits dans le plan.
Valide chaque entree avec Zod. Quand les endpoints sont prets, envoie un message
avec le contrat API complet (endpoints, types, exemples) — ce message sera transmis
au Frontend dans la phase suivante."

Rappel : chaque agent doit lire son fichier de role ET le plan de la feature.
```

---

## Phase 3 — Frontend + Tests (en parallele, apres le contrat API)

```
Cree une equipe d'agents pour implementer le frontend et les tests de la feature
decrite dans docs/plans/feature-[nom].md.

Le contrat API est disponible [colle ici le contrat API que le Backend a produit,
ou reference le fichier].

Spawne 2 coequipiers :

1. Agent Frontend avec le prompt :
"Tu es le Frontend Developer. Lis .claude/agents/frontend-developer.md et le plan dans
docs/plans/feature-[nom].md. Voici le contrat API : [contrat]. Implemente les composants
UI decrits dans le plan. Chaque composant gere les 5 etats (loading, empty, data, error,
disabled). TypeScript strict, zero any."

2. Agent QA avec le prompt :
"Tu es le QA Engineer. Lis .claude/agents/qa-engineer.md et le plan dans
docs/plans/feature-[nom].md. Ecris les tests E2E pour les parcours decrits dans les
criteres d'acceptation. Ecris aussi les tests unitaires pour la logique metier.
Couvre les cas normaux, les cas limites ET les cas d'erreur."

Les deux agents travaillent en parallele. Le QA peut demander au Frontend l'etat
d'avancement si necessaire pour ecrire les tests E2E.
```

---

## Phase 4 — Securite + Documentation (pre-release)

```
Cree une equipe d'agents pour la revue pre-release de la feature
decrite dans docs/plans/feature-[nom].md.

Spawne 2 coequipiers :

1. Agent Security avec le prompt :
"Tu es le Security Engineer. Lis .claude/agents/security-engineer.md.
Audite le code ajoute pour cette feature : validation des entrees, injection,
XSS, gestion des tokens, headers de securite. Produis ton rapport dans
docs/reports/security-review-feature-[nom].md."

2. Agent Tech-Writer avec le prompt :
"Tu es le Technical Writer. Lis .claude/agents/tech-writer.md.
Mets a jour la documentation pour cette feature : API docs, README si necessaire,
CHANGELOG. Documente les nouveaux endpoints et les changements de schema."

Audit en lecture seule pour Security. Documentation seulement pour Tech-Writer.
```

---

## Phase 5 — Go/No-Go

Session solo pour la synthese :

```
Lis le rapport de securite dans docs/reports/security-review-feature-[nom].md.
Verifie que :
- Tous les tests passent (npm run test && npm run test:e2e)
- Le build reussit (npm run build)
- Le lint est propre (npm run lint)
- Le type-check passe (npm run type-check)

Produis un rapport Go/No-Go dans docs/reports/go-nogo-feature-[nom].md avec :
- Checklist de validation (chaque point passe/echoue)
- Risques residuels
- Decision recommandee : GO ou NO-GO avec justification
```
