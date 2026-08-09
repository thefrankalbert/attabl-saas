# Model Selection & Multi-Agent Orchestration Rules - ATTABL SaaS

Ces regles gouvernent DEUX choses : (1) quel modele utiliser selon la
complexite d'une tache (economie de tokens), (2) comment orchestrer des
agents multiples avec des responsables auditeurs quand un chantier le
demande. Elles s'appliquent a l'agent principal ET a tout agent/workflow
qu'il dispatche.

## 1. Selection du modele par complexite (economie de tokens)

REGLE : ne jamais depenser un modele avance sur une tache simple. Choisir
le modele le moins cher qui fait le travail correctement. Un modele avance
sur une tache mecanique = gaspillage de tokens = interdit sans raison.

### Tiers de modeles

| Modele | ID | Usage |
| --- | --- | --- |
| **Haiku** | `claude-haiku-4-5-20251001` | Taches SIMPLES / mecaniques |
| **Sonnet** | `claude-sonnet-5` | Taches MOYENNES |
| **Opus** | `claude-opus-4-8` | Taches COMPLEXES / risquees |

### Classification

**SIMPLE -> Haiku (ou effort `low`)** :
- Renommage, fix d'import manquant, correction de typo.
- Application d'un format Prettier, fix lint mecanique.
- Edition mono-fichier sans logique (changer un label, une classe Tailwind
  complete, un texte i18n deja redige).
- Recherche/grep, lecture pour localiser un symbole, resume de fichier.
- Scaffolding de test repetitif a partir d'un patron existant.
- Verification binaire d'un fait ("est-ce que X existe dans le fichier ?").

**MOYENNE -> Sonnet (effort `medium`)** :
- Implementation d'un composant ou d'une fonction dont le contrat est clair.
- Refactor multi-fichiers sans changement d'architecture.
- Ecriture de tests couvrant des cas limites definis.
- Revue de code d'un diff cible (une dimension).

**COMPLEXE -> Opus (effort `high`/`xhigh`)** :
- Decisions d'architecture, design de schema DB, migrations.
- Tout ce qui touche la securite (auth, RLS, rate limiting, secrets).
- Debug d'un bug ambigu ou d'une cascade d'erreurs.
- Logique multi-tenant, verification de prix serveur, paiements/Stripe.
- Toute modification d'un fichier protege (voir CLAUDE.md "Fichiers proteges").
- Synthese finale d'un audit, jugement adversarial d'un finding critique.

### Comment appliquer

- **Agent tool** : passer `model: "haiku" | "sonnet" | "opus"` selon le tier.
  Omettre = herite du modele de session (souvent Opus) -> ne PAS omettre
  pour une tache simple, downgrade explicitement a `haiku`.
- **Workflow** : `agent(prompt, { model, effort })` par appel. Stages
  mecaniques -> `model:'haiku', effort:'low'`. Stages de jugement /
  verification critique -> `effort:'high'` (voire Opus). Par defaut un
  agent herite du modele de la boucle principale ; ne surcharger que quand
  on est sur du tier.
- En cas de doute sur la complexite : commencer au tier inferieur. Si le
  resultat est insuffisant, re-dispatcher au tier superieur. Rater une
  fois sur Haiku coute moins qu'un run Opus systematique.

## 2. Orchestration multi-agents : workers + responsables auditeurs

Pour les chantiers substantiels (refactor large, programme multi-phases,
audit, migration), ne pas travailler en agent solo. Structurer en
worker + responsable, pour que chaque tache produite soit auditee avant
d'etre acceptee.

### Pattern

1. **Worker** (tier selon complexite) : execute la tache, produit un diff
   ou un livrable + un compte-rendu structure de ce qu'il a fait.
2. **Responsable auditeur** (tier COMPLEXE, adversarial) : verifie le
   livrable du worker de facon independante. Son prompt le pousse a
   REFUTER : chercher regression, dette, item d'audit non traite, fichier
   protege touche sans raison, violation des regles CLAUDE.md (typographie
   ASCII, tenant_id, viewport, design system shadcn, zero dette).
3. **Verdict** : si l'auditeur rejette, le worker corrige et repasse.
   Un livrable n'est ACCEPTE que quand l'auditeur le valide.

### Regles d'orchestration

- Un responsable ne valide JAMAIS son propre travail : worker et auditeur
  sont des agents distincts.
- Pour un finding ou une decision critique (securite, migration prod,
  suppression) : panel de plusieurs auditeurs a angles distincts
  (correctness / securite / regression), majorite requise.
- **Sequentiel quand les fichiers sont partages** : le programme
  back-office stock touche des hotspots communs (voir
  `docs/BACKOFFICE-STOCK-PROGRAM.md`). Jamais deux workers en parallele
  sur le meme fichier chaud -> une phase a la fois.
- Parallele UNIQUEMENT pour du travail reellement independant (dimensions
  d'audit distinctes, fichiers disjoints).
- Chaque worker recoit un scope FIGE et la liste des fichiers proteges. Il
  demande confirmation avant de toucher un fichier protege (regle CLAUDE.md).

### Points de pause obligatoires (ne pas franchir en autonome)

Meme en mode multi-agents autonome, l'orchestrateur PAUSE et demande a
l'utilisateur avant :
- Appliquer une migration prod destructive / qui retire un acces
  (DROP, tighten RLS) -> backup + deploy du code d'abord (voir
  `feedback_migration_deploy_ordering`).
- Merger une PR.
- Toute action destructive non autorisee, ou besoin d'un secret absent.
