# Audit approfondi - Accueil refonte + Marketing copy

Genere : 2026-04-22
Scope :
- Accueil tenant client (`ClientMenuPageRefonte`) + SearchOverlay + FloatingCartBar
- Menu/categorie legacy (`ClientMenuDetailPage`)
- Marketing `(marketing)/*`, auth layouts, pricing card, testimonials

---

## A. Search bar (Accueil)

**Chaine technique : PASS**

SearchTrigger -> `setIsSearchOpen(true)` -> SearchOverlay avec `searchableItems` + `onOpenDetail` callback -> filtrage par `normalize(name|description)` -> clic resultat -> close overlay + open `ItemDetailSheet`.

Chaine cablee correctement dans `ClientMenuPageRefonte.tsx` (lignes 292-296 trigger, 510-520 overlay).

**Racine du probleme utilisateur : dataset limite**

`searchableItems` est construit a partir de `featuredItems + recentItems + discountedItems` dedupliques (lignes 236-246). Si un plat n'est dans aucune de ces 3 categories serveur, il est invisible de la recherche.

**Correctif propose** : passer la totalite des `menu_items` disponibles, pas uniquement les sous-ensembles. Necessite soit :
1. Charger un index de recherche complet cote serveur dans `sites/[site]/page.tsx` et le passer en prop,
2. OU faire un fetch async lazy dans SearchOverlay lors de l'ouverture.

Option 1 plus simple + plus rapide a l'usage (pas de latence a l'ouverture).

---

## B. FloatingCartBar - position incoherente entre Accueil et /menu

**Verdict : FAIL**

| Ecran | Fichier | Ligne | `bottom` |
|---|---|---|---|
| Accueil (refonte) | `ClientMenuPageRefonte.tsx` | 470 | `calc(64px + env(safe-area-inset-bottom,0px) + 12px)` |
| Menu categorie (legacy) | `ClientMenuDetailPage.tsx` | 774 | `calc(60px + env(safe-area-inset-bottom,0px) + 16px)` |

**Racine** : hauteur des deux bottom nav differentes.
- `BottomNavRefonte` (Accueil) : `pt-2.5 pb-5` + min-h-[44px] -> ~64px total
- `BottomNav` (legacy) : `h-[60px]` -> 60px fixe

L'Accueil calcule `64px + 12px = 76px`. La cart bar arrive exactement au bord du nav (0px de gap).
Le menu calcule `60px + 16px = 76px`. La cart bar est a 16px au-dessus du nav (bien detachee).

**Correctif propose (appliquer)** : remplacer le gap Accueil `12px` par `16px` pour matcher le comportement menu.

---

## C. Hero photo plein-ecran sur page categorie

**Verdict : ABSENT**

Le user se souvient d'un pattern : entrer dans une carte -> voir une grande photo en haut -> photo collapse au scroll -> ne reste que categorie + search.

Recherche dans le worktree :
- `src/components/tenant/ClientMenuDetailPage.tsx` (legacy, en prod) : pas de hero image. Layout : header + search + venue filter + tabs + categories + items list. Direct.
- Pas de `ClientMenuDetailPageRefonte.tsx` dans ce worktree (supprime lors du rollback utilisateur le 2026-04-22).
- Git log : aucun commit n'a jamais implemente ce pattern sur la page categorie dans ce worktree.

**Conclusion** : le user **se souvient probablement d'un prototype ou mockup** (le mockup Blutable avait bien ce pattern sur la SCREEN 9 "Vue categorie"). En code, ca n'a jamais existe ici.

**Si on veut le re-ajouter** : ~4h de travail.
- Composant `CategoryHeroImage` (image plein largeur, aspect 16/9 ou fixed height ~240px)
- Scroll listener qui fade/collapse au scroll (opacity 1 -> 0 sur 100-200px de scroll)
- Sticky search bar + chips qui prennent le relais au-dessus des items
- Source d'image : `category.image_url` (champ a ajouter au schema DB) ou fallback `/category-icons/*.png`

Decision a valider avant implementation.

---

## D. Marketing copy - 70% production-ready

### Redondances majeures (top 5)

| Page | Probleme | Reco |
|---|---|---|
| restaurants/hotels/bars/fast-food/quick-service | "Essayez gratuitement" puis "Demarrer gratuitement" empiles | Supprimer le sous-titre, un CTA unique |
| pricing | "14 jours gratuit sans carte" repete 4x (hero, badges, features, FAQ) | Garder hero uniquement, FAQ en lien |
| home + tous segment pages | Headlines "X connecte" / "Tout piloté" formulaique | Hero specifique par segment |
| pricing + authLayout + socialProof | Memes metrics "40% erreurs reduites" / "35% commandes" partout | Metrics differents par contexte |
| tous segment pages | "Menu digital" premier feature des 5 pages | Lead avec la pain point du segment |

### Copy quality (top 5)

| Fichier:ligne | Probleme | Reecriture |
|---|---|---|
| `fast-food/page.tsx:14` | Accents manquants: "echelle", "Ecran" | "Écran cuisine, stock centralisé. La vitesse à grande échelle." |
| `quick-service/page.tsx:52` | "Notifications en temps reel" vague | "Vos clients et votre equipe recoivent des mises a jour a chaque etape" |
| `pricing/page.tsx:151` | Jargon "Fiches techniques (cout matiere)" | "Cout de chaque plat : combien vous gagnez reellement par assiette" |
| `AuthLayout.tsx:23` + `SocialProof.tsx:8` | "on a reduit/change/pousse" lowercase + sans accent | Title case + accents corrects |
| `CTASection.tsx:8` | "Votre commerce merite mieux qu'un carnet et une calculette" cliche | Plus concret et ATTABL-specifique |

### Formatting inconsistencies

- **CTA button wording** : 4 variantes a travers les pages ("Demarrer gratuitement" / "Commencer" / "Essayer gratuitement" / "Creer mon compte gratuit"). Standardiser sur "Demarrer gratuitement" partout sauf pricing PRO.
- **Headline hierarchy** : segment pages `text-4xl sm:text-5xl lg:text-6xl` vs home VideoHero `text-5xl sm:text-6xl lg:text-7xl`. Aligner.
- **FAQ** : "Que se passe-t-il apres les 14 jours ?" -> "après".
- **Quotes HTML** : `&ldquo;` (AuthLayout) vs straight quotes (SocialProof). Uniformiser.
- **Numbers** : "1 847 000 FCFA" (NBSP) vs "149000 XAF" (collé). Uniformiser au NBSP.
- **"Temoignages"** (SocialProof:88) -> "Témoignages".

### Stale references

**Aucune mention de lime/UberEats/anciens accents** dans le copy marketing. Swap accent complet.

**Exception** : `AuthLayout.tsx` utilise `#4ade80` (Tailwind green-400) au lieu de `#2e7d32` sur 2 points decoratifs (lignes 63, 104 du mockup dashboard mini-preview). A corriger pour coherence Square.

### Mobile-first

- `hotel/page.tsx:11` hero "Un hotel. Plusieurs restaurants. Une seule plateforme." = 8 mots une ligne mobile 375px, wrap moche. Raccourcir.
- `pricing/page.tsx:299` "14 jours d'essai gratuit sur le plan PRO. Sans carte bancaire." wrap moche. Version courte "14 jours gratuit. Sans CB."

---

## Verdict global

| Axe | Verdict | Blocker ship ? |
|---|---|---|
| Search bar Accueil | PASS (chaine), mais dataset limite | Pas bloquant, amelioration UX recommandee |
| FloatingCartBar position Accueil | FAIL | Bloquant (visuel casse) - **fix en 1 ligne** |
| Hero photo categorie | ABSENT | Jamais implemente - decision produit requise |
| Marketing copy | 70% ready | Pass polish recommande avant release Square |

---

## Check-list fixes immediats

- [x] Rapport ecrit
- [ ] FloatingCartBar Accueil : gap 12px -> 16px
- [ ] SearchOverlay : passer dataset complet items
- [ ] AuthLayout : `#4ade80` -> `#2e7d32` (2 lignes)
- [ ] Typos accents : "Ecran", "echelle", "Temoignages", "apres" (4 fichiers)
- [ ] Decision produit : hero photo sur page categorie (implementer oui/non ?)
- [ ] Pass copy marketing : uniformiser CTAs + redondances (defer si decision)
