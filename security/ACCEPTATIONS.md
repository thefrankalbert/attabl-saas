# Vulnerabilites acceptees

Ce fichier liste les vulnerabilites de dependances que le projet assume
sciemment, avec la raison et la condition de revue. Il existe pour qu'une CVE
laissee en place soit un **choix trace**, jamais un oubli.

## Etat au 2026-08-05

**Aucune vulnerabilite acceptee.**

```
pnpm audit --audit-level=high
0 vulnerabilites : 0 critique | 0 haute | 0 moderee | 0 basse
```

Le plan pre-pilote prevoyait d'en acter trois. Les trois ont finalement ete
**corrigees** au lieu d'etre acceptees, dans la PR #305 :

| CVE prevue                                        | Ce qui etait envisage                                              | Ce qui a ete fait                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `xlsx` (SheetJS) - pollution de prototype + ReDoS | Accepter : aucun correctif publie sur npm, usage confine aux tests | **Dependance supprimee.** L'analyse a montre que l'usage n'etait PAS confine aux tests : `xlsx` lisait des fichiers **uploades par les utilisateurs**, cote serveur. La lecture est passee a `exceljs`, deja installe |
| `esbuild` - severite basse, Windows               | Accepter : non atteignable sur Vercel (Linux)                      | **Corrige** par override `>=0.28.1`. Une CVE corrigeable par une ligne ne merite pas un dossier d'acceptation                                                                                                         |
| `sharp`                                           | Accepter : non atteignable sur Vercel                              | **Corrige** par l'override existant `sharp@<0.35.0: 0.35.3`                                                                                                                                                           |

## Quand ajouter une entree ici

Une vulnerabilite ne peut etre acceptee que si **les trois** conditions sont
reunies :

1. **Aucun correctif n'existe** - ni version publiee, ni override possible, ni
   remplacement raisonnable de la dependance.
2. **Le chemin d'exploitation est demontre inatteignable**, et la demonstration
   est ecrite ici. Pas "probablement pas atteignable" : le chemin exact est
   trace, du point d'entree jusqu'a la fonction vulnerable.
3. **Une condition de revue est fixee** - une date, ou un evenement
   (publication d'un correctif amont, changement d'usage de la dependance).

Le piege a eviter est celui de `xlsx` : la justification "confine aux tests"
etait plausible et **fausse**. Avant d'ecrire qu'un usage est confine, chercher
les appels dans **tout** le depot, `tests/` et `scripts/` compris - pas
seulement `src/`.

## Format d'une entree

```markdown
### <paquet> <CVE / GHSA>

- **Severite** :
- **Chemin** : (sortie de `pnpm why <paquet>`)
- **Pourquoi aucun correctif** :
- **Pourquoi inatteignable** : (chemin d'appel demontre)
- **Revue** : (date ou evenement declencheur)
- **Acte par** : (qui, quand)
```
