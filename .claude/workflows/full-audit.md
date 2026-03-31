# Workflow : Audit Complet d'un Projet Existant

## Prerequis

1. Claude Code v2.1.32 ou plus recent (`claude --version`)
2. Agent Teams active dans `~/.claude/settings.json` :
   ```json
   {
     "env": {
       "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
     }
   }
   ```
3. tmux installe (recommande pour voir chaque agent dans son propre panneau)
4. Plan Pro ($20/mois) ou Max ($100-200/mois)

## Strategie : Auditer par vagues

Ne lance PAS les 11 agents d'un coup. Les tokens s'accumulent et la coordination devient chaotique.
Lance par vagues de 3-4 agents max, chaque vague a un focus precis.

---

## Vague 1 — Architecture & Securite (les fondations)

### Prompt a copier-coller dans Claude Code :

```
Cree une equipe d'agents pour auditer ce projet.

Spawne 2 coequipiers :

1. Agent Tech-Lead avec le prompt :
"Tu es le Tech Lead. Lis tes instructions dans .claude/agents/tech-lead.md.
Audite l'architecture de ce projet : structure des dossiers, separation des
responsabilites, dette technique, qualite du typage TypeScript, gestion des
erreurs, dependances. Produis ton rapport dans docs/reports/tech-lead-report.md.
Concentre-toi UNIQUEMENT sur les fichiers dans src/ et la configuration racine."

2. Agent Security avec le prompt :
"Tu es le Security Engineer. Lis tes instructions dans .claude/agents/security-engineer.md.
Audite la securite de ce projet : OWASP Top 10, headers de securite, authentification,
gestion des secrets, dependances vulnerables (lance npm audit), validation des entrees.
Produis ton rapport dans docs/reports/security-engineer-report.md."

Chaque agent doit lire son fichier de role AVANT de commencer l'audit.
Ne commencez pas a modifier du code — c'est un audit en lecture seule.
Produisez vos rapports dans docs/reports/.
```

### Resultat attendu
- `docs/reports/tech-lead-report.md`
- `docs/reports/security-engineer-report.md`

---

## Vague 2 — Qualite & Performance

### Prompt :

```
Cree une equipe d'agents pour auditer la qualite et la performance de ce projet.

Spawne 2 coequipiers :

1. Agent QA avec le prompt :
"Tu es le QA Engineer. Lis tes instructions dans .claude/agents/qa-engineer.md.
Audite la couverture de tests, identifie les tests manquants, verifie l'accessibilite
avec axe-core, et identifie les bugs potentiels. Produis ton rapport dans
docs/reports/qa-engineer-report.md."

2. Agent Frontend avec le prompt :
"Tu es le Frontend Developer. Lis tes instructions dans .claude/agents/frontend-developer.md.
Audite le code frontend : TypeScript strict, gestion des etats dans les composants,
responsive, performance Lighthouse, accessibilite, code mort. Produis ton rapport
dans docs/reports/frontend-developer-report.md."

Audit en lecture seule. Rapports dans docs/reports/.
```

---

## Vague 3 — Backend & Donnees

### Prompt :

```
Cree une equipe d'agents pour auditer le backend et la base de donnees.

Spawne 2 coequipiers :

1. Agent Backend avec le prompt :
"Tu es le Backend Developer. Lis tes instructions dans .claude/agents/backend-developer.md.
Audite les API : validation des entrees, gestion d'erreurs, rate limiting, securite des
endpoints, couverture de tests backend. Produis ton rapport dans
docs/reports/backend-developer-report.md."

2. Agent DBA avec le prompt :
"Tu es le Database Admin. Lis tes instructions dans .claude/agents/database-admin.md.
Audite le schema de base de donnees : normalisation, index, migrations, naming,
donnees sensibles, backups. Produis ton rapport dans docs/reports/dba-report.md."

Audit en lecture seule. Rapports dans docs/reports/.
```

---

## Vague 4 — UX, UI & Documentation

### Prompt :

```
Cree une equipe d'agents pour auditer l'UX, l'UI et la documentation.

Spawne 3 coequipiers :

1. Agent UX avec le prompt :
"Tu es l'UX Designer. Lis tes instructions dans .claude/agents/ux-designer.md.
Audite les parcours utilisateur, l'accessibilite, l'architecture de l'information.
Applique les heuristiques de Nielsen. Produis ton rapport dans
docs/reports/ux-designer-report.md."

2. Agent UI avec le prompt :
"Tu es l'UI Designer. Lis tes instructions dans .claude/agents/ui-designer.md.
Audite le Design System : tokens de couleurs, typographie, espacements, composants,
coherence visuelle, contraste. Produis ton rapport dans
docs/reports/ui-designer-report.md."

3. Agent Tech-Writer avec le prompt :
"Tu es le Technical Writer. Lis tes instructions dans .claude/agents/tech-writer.md.
Audite la documentation : README, API docs, CHANGELOG, CONTRIBUTING, variables
d'environnement. Produis ton rapport dans docs/reports/tech-writer-report.md."

Audit en lecture seule. Rapports dans docs/reports/.
```

---

## Vague 5 — Synthese

Apres les 4 vagues, tu as 9 rapports dans `docs/reports/`. Lance une derniere session :

```
Lis tous les rapports dans docs/reports/. Synthetise-les en un rapport executif unique
dans docs/reports/AUDIT-SYNTHESE.md avec :
- Score global du projet (A/B/C/D/F)
- Top 10 des problemes critiques a corriger en priorite
- Top 5 des forces du projet
- Feuille de route de remediation sur 4 semaines
- Estimation de l'effort par categorie (securite, qualite, performance, documentation)
```

---

## Conseils d'utilisation

1. **Active le mode delegate** (Shift+Tab) pour que le Team Lead coordonne sans implementer
2. **Utilise tmux** pour voir chaque agent dans son panneau : `tmux` avant de lancer Claude Code
3. **Navigue entre agents** avec Shift+Down pour verifier leur progression
4. **Si un agent est bloque**, navigue vers lui et donne-lui des instructions supplementaires
5. **Cout estime** : ~$5-15 par vague selon la taille du projet. Total audit complet : ~$20-60
