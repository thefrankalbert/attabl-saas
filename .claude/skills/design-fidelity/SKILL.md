---
name: design-fidelity
description: Enforce pixel-perfect reproduction of provided designs
---

# Design Fidelity Rules

## Quand un design de reference est fourni (image, code, ou screenshot) :
- Reproduire le design EXACTEMENT tel quel — structure, couleurs, espacements, tailles
- NE JAMAIS substituer des composants, couleurs ou fonts par des "equivalents preferes"
- NE JAMAIS ajouter, supprimer ou reorganiser des elements visuels
- Conserver les noms de classes Tailwind tels quels
- Conserver les icones specifiees (lucide-react) sans substitution

## Tokens du projet ATTABL :
- Couleurs : utiliser UNIQUEMENT les variables CSS definies dans globals.css
- Fonts : respecter la font-stack definie dans tailwind.config
- Radius : utiliser les valeurs radius du theme shadcn
- Spacing : respecter l'echelle Tailwind, ne jamais inventer de valeurs arbitraires

## Workflow obligatoire :
1. LIRE le code/design de reference fourni integralement
2. LISTER les differences si adaptation necessaire
3. DEMANDER confirmation AVANT toute modification visuelle
4. Implementer sans deviation
