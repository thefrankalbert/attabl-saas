# Design Spec - Chevalet Standard (Tente de Table)

**Date :** 2026-04-29  
**Statut :** Approuve  
**Auteur :** Frank (brainstorm) + Claude Code

---

## Contexte

Nouveau support d'impression "chevalet standard" - une tente de table pliee en deux faces.
C'est le format phare ATTABL pour les 6 prochains mois. Il rejoint le systeme QR existant
sans le modifier.

---

## Dimensions et resolution

| Parametre                | Valeur                                 |
| ------------------------ | -------------------------------------- |
| Format                   | Tente de table pliee (deux panneaux)   |
| Largeur                  | 21,7 cm (217 mm / ~2 562 px a 300 DPI) |
| Hauteur par panneau      | 11 cm (110 mm / ~1 299 px a 300 DPI)   |
| Hauteur totale depliee   | 22 cm (220 mm / ~2 598 px a 300 DPI)   |
| Resolution export        | 300 DPI                                |
| Format export principal  | PDF vectoriel                          |
| Format export secondaire | PNG 300 DPI                            |

Conversions unites (300 DPI) : 1 cm = 10 mm = ~118 px

---

## Architecture

### Nouvelle route

```
/sites/[site]/admin/supports/
```

Ouvre directement l'editeur chevalet. Pas de catalogue pour l'instant.

### Entree sidebar

Ajout de "Supports" dans la navigation admin.

### Nouveaux fichiers

```
src/app/sites/[site]/admin/supports/
  page.tsx

src/components/admin/supports/
  ChevaletEditor.tsx        # Editeur principal (Client Component)
  ChevaletPreview.tsx       # Preview live recto + verso
  ChevaletControls.tsx      # Formulaire elements + unites
  UnitInput.tsx             # Input cm/mm/px interchangeable
  VersoOptions.tsx          # Selecteur 3 etats verso

src/app/api/supports/export/route.ts
src/services/supports.service.ts
src/lib/validations/supports.schema.ts
src/types/supports.types.ts
supabase/migrations/20260429_tenant_supports.sql
```

### Persistance

Nouvelle table Supabase `tenant_supports` :

```sql
id          uuid primary key default gen_random_uuid()
tenant_id   uuid not null references tenants(id) on delete cascade
type        text not null default 'chevalet_standard'
config      jsonb not null default '{}'
created_at  timestamptz not null default now()
updated_at  timestamptz not null default now()

unique(tenant_id, type)
```

RLS : lecture/ecriture filtre par tenant_id via admin_users (pattern existant).

---

## Editeur - layout

Deux colonnes :

- **Gauche (~380px fixe)** : panneau de controles
- **Droite (flex-1)** : preview live recto + verso (si actif) + boutons export

---

## Elements du recto

Chaque element a : taille, position X, position Y (en unite choisie par l'utilisateur).

| Element                | Pre-rempli depuis                   |
| ---------------------- | ----------------------------------- |
| Logo                   | `tenant.logo_url`                   |
| Nom de l'etablissement | `tenant.name`                       |
| Tagline / description  | `tenant.description`                |
| QR code                | Style deja choisi dans l'onboarding |
| Couleur de fond        | `tenant.primary_color`              |
| Couleur accent         | `tenant.secondary_color`            |

Les valeurs sont chargees automatiquement a l'ouverture si aucune config sauvegardee n'existe.

---

## Options verso

Selecteur radio - un seul etat actif a la fois :

| Option                    | Comportement                       | Export      |
| ------------------------- | ---------------------------------- | ----------- |
| **Recto simple** (defaut) | Verso blanc, pas affiche           | 1 page PDF  |
| **Logo seul**             | Logo centre, fond couleur primaire | 2 pages PDF |
| **Miroir recto**          | Copie identique du recto           | 2 pages PDF |

Si aucune option verso n'est cochee = recto simple (verso blanc).

---

## Systeme d'unites

Selecteur global : **cm / mm / px**

- Toutes les valeurs de l'editeur se convertissent automatiquement au changement d'unite
- Rien ne bouge visuellement lors du changement
- Les inputs acceptent des decimales (ex: `10,5 mm`)
- Preview mis a jour en temps reel

---

## Export

### API route : `/api/supports/export`

**POST** avec body JSON = config complete du chevalet.

Parametres :

- `format`: `"pdf"` (defaut) ou `"png"`
- `config`: objet config complet

Librairie : `@react-pdf/renderer` (fonctionne sur Vercel, pas de headless browser).

Sorties :

- PDF : `chevalet-[slug-etablissement].pdf` - 1 ou 2 pages selon option verso
- PNG : `chevalet-[slug-etablissement].png` - 2 562 x 1 299 px a 300 DPI

Le QR code est genere en SVG vectoriel dans le PDF (pas de pixelisation).

---

## Persistance

- **Sauvegarde automatique** : debounce 30 secondes apres chaque modification
- **Sauvegarde immediate** : a chaque clic sur "Telecharger"
- **Chargement** : config sauvegardee si existe, sinon valeurs par defaut depuis branding
- **Upsert** sur `(tenant_id, type)` - un seul enregistrement par tenant par format

---

## Acces et plans Stripe

Disponible sur tous les plans existants. Pas de gate.

---

## Ce qui NE change pas

- Les templates QR existants (Standard, Elegant, Neon, Minimal) : intacts
- Le flow onboarding LaunchStep : intact
- Les dimensions sont fixes (21,7 x 11 cm) - le "personnalisable au millimetre" s'applique
  aux elements a l'interieur du chevalet (positions, tailles), pas au format lui-meme

---

## Hors scope (version actuelle)

- Catalogue multi-formats
- Autres formats (A4, carte de visite, affiche)
- Drag-and-drop canvas
- Templates predifinis multiples pour le chevalet
