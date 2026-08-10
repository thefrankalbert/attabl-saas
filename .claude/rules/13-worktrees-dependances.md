# Worktrees et dependances - ATTABL SaaS

Cette regle existe a cause d'un incident du 2026-08-10. Elle s'applique a
l'agent principal ET a tout agent/session qui travaille en worktree.

## 0. L'incident, pour comprendre ce qu'on protege

Le `node_modules` du depot principal s'est retrouve avec son magasin pnpm
pointe vers un worktree :

```
virtualStoreDir: ../.worktrees/lot3-offline/node_modules/.pnpm
```

Les worktrees sont imbriques DANS le depot (`.worktrees/`), donc pnpm peut
resoudre un magasin hors du projet courant. Consequence : **supprimer un
worktree fusionne - un geste de menage anodin - cassait les dependances du
depot principal.** Rien, dans le message d'erreur, n'aurait mentionne un
worktree : on aurait cherche la panne pendant des heures au mauvais endroit.

Symptome rencontre a l'install suivant :

```
pnpm now wants to use the virtual store at ".../node_modules/.pnpm"
```

## 1. Les trois verrous en place

1. **`.npmrc` versionne** : `virtual-store-dir=node_modules/.pnpm`. C'est deja
   la valeur par defaut ; l'ecrire la rend EXPLICITE et versionnee. Le chemin
   est relatif, donc chaque checkout - depot principal comme worktree - ancre
   son magasin chez lui.
2. **`scripts/verifier-worktrees.sh`** : detecte la derive, liste les dossiers
   fantomes, et dresse l'inventaire de ce qui est sur a supprimer.
3. **Garde `pre-commit` (Gate 0c)** : lance le script en `--quiet`. Muet quand
   tout va bien ; bloque UNIQUEMENT sur un magasin hors projet.

Ne pas retirer l'un des trois en pensant que les deux autres suffisent : le
`.npmrc` previent, le script verifie que la prevention tient, la garde fait que
personne n'oublie de verifier.

## 2. Avant de supprimer un worktree - jamais dans l'autre ordre

```bash
bash scripts/verifier-worktrees.sh   # inventaire + etat
```

Un worktree n'est supprimable que si les DEUX conditions tiennent :

- sa branche est fusionnee (voir le piege du squash ci-dessous),
- il n'a **aucun** fichier non commite.

Puis, dans cet ordre :

```bash
git worktree remove .worktrees/<nom>   # jamais `rm -rf` d'abord
git worktree prune                      # nettoie les metadonnees restantes
```

`rm -rf` en premier laisse git avec des metadonnees orphelines, et le menage
suivant echouera a moitie en laissant un etat que personne ne saura expliquer.

## 3. Piege du squash (verifie le 2026-08-10)

Ce depot merge en **squash**. Une branche fusionnee n'est donc **jamais**
ancetre de `main` :

```bash
git merge-base --is-ancestor fix/lot-3-offline origin/main   # FAUX, pourtant fusionnee
```

Se fier a ce seul test declare tout "non fusionne" a vie : l'inventaire devient
un bruit qu'on apprend a ignorer, donc un inventaire inutile. La source de
verite pour ce workflow est l'etat de la PR :

```bash
gh pr list --head <branche> --state merged --limit 1
```

Le script applique deja les deux tests dans cet ordre.

## 4. Piege des dossiers fantomes

Un dossier de `.worktrees/` inconnu de git n'est PAS un worktree : c'est un
residu de `git worktree remove` (artefacts de build non suivis, que git n'avait
pas a supprimer).

**`git worktree prune` ne les enlevera PAS** - il nettoie les metadonnees de
git, pas le disque. Le script les signale sans bloquer, et compte les fichiers
source pour distinguer d'un coup d'oeil un residu de build d'un travail oublie.
Ne supprimer que ceux dont le compte de sources est `0`.

## 5. Regle de conduite

- **Ne jamais lancer `pnpm install` depuis un worktree sans verifier apres.**
  En cas de doute : `bash scripts/verifier-worktrees.sh`.
- Un magasin hors projet se repare par un install propre dans le checkout
  concerne : `CI=true pnpm install` (le `CI=true` autorise pnpm a refaire le
  `node_modules` sans TTY).
- Ne jamais supprimer un worktree "pour faire de la place" pendant une autre
  tache. Le menage est une tache a part entiere, avec son inventaire.
