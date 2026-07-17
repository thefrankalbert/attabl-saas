# Standalone Full-Page Responsive Rules - ATTABL SaaS

Ces regles existent a cause d'incidents repetes (juillet 2026) sur les pages auth
(login/signup/forgot/reset) : scroll horizontal, carte ecrasee, PUIS scroll
vertical parasite sur iPad 11 pouces paysage. Elles s'appliquent a TOUTE route
plein-ecran autonome hors shell (auth, checkout success/cancel, onboarding,
error/not-found) et a tout layout "carte centree + panneau lateral".

## 1. Contrat responsive INCASSABLE (obligatoire)

Un layout plein-ecran autonome DOIT tenir sur TOUS les terminaux sans casse :

- **Pas de scroll horizontal, jamais.** Le conteneur racine du shell porte
  `overflow-x-clip` (PAS `overflow-hidden` : `hidden` force l'autre axe en `auto`
  et cree un conteneur de scroll parasite ; `clip` non). Les colonnes flex sont
  `min-w-0` (peuvent retrecir) ; un panneau lateral est `shrink-0` et n'apparait
  qu'a partir d'un breakpoint (`lg`/`xl`), jamais en dessous.
- **Pas de scroll vertical parasite sur ecran court.** Le padding vertical du
  conteneur de la carte doit etre HEIGHT-AWARE, pas une valeur fixe genereuse :
  serre par defaut (`py-6`) pour tenir en tablette paysage (~660-810px utiles),
  genereux seulement sur grand ecran via `[@media(min-height:820px)]:py-12`.
  Objectif mesure : contenu de la page d'entree (login) < ~680px de haut.
- **Carte fluide** : `w-full max-w-sm` dans des gouttieres (`px-5`), jamais de
  largeur px fixe. Garder `items-start` (le centrage flex `items-center` clippe
  le haut de la carte quand le contenu depasse dans un conteneur scrollable).
- **Champs caches (honeypot)** : JAMAIS `-left-[9999px]`/`-top-[9999px]` - dans un
  conteneur `overflow-y-auto` ca cree une region scrollable. Utiliser un champ
  taille-0 clippe : `h-0 w-0 overflow-hidden opacity-0`.
- **Safe-area** : header/footer fixes decalent avec `env(safe-area-inset-*)`.

## 2. Verification - NE PAS se fier a l'automation seule

Le navigateur d'automatisation (claude-in-chrome) a un **viewport verrouille
~1464x824**. Il NE PEUT PAS rendre fidelement une vraie largeur tablette/telephone
NI une hauteur paysage courte. Donc :

- Pour l'overflow : MESURER en JS en contraignant le conteneur de scroll a chaque
  dimension cible (largeurs 320/375/768/834/1024/1194/1280/1440 ; hauteurs
  660/700/744) et lire `scrollWidth`/`scrollHeight`. Pour tester une branche de
  media-query height que le viewport reel ne declenche pas, forcer la valeur
  (ex : `main.style.padding`) avant de mesurer.
- Une media-query `min-height` se lit sur le VIEWPORT reel (824), pas sur le
  conteneur contraint : en tenir compte dans les mesures.
- Si l'observation reelle est impossible, le DIRE et demander une capture de
  l'appareil reel (cf regle 11 section 0). Ne jamais conclure "corrige" sur la
  seule lecture des classes.

## 3. Serveur de preview local - tuer par PORT (piege recurrent)

`pkill -f "PORT=3240"` NE tue PAS le serveur : le process s'appelle `next start` /
`next-server`, `PORT=` n'est qu'un prefixe d'env absent de l'argv. Resultat : un
serveur zombie continue de servir l'ANCIEN build, et les "verifications" passent
sur du code perime.

- Toujours tuer par port : `lsof -ti :PORT | xargs kill -9`.
- Verifier qu'il ne reste rien : `lsof -ti :PORT` (doit etre vide) avant de
  relancer et re-mesurer.
- En cas de doute sur un rendu inchange : cache-bust (`?v=N`) + purge SW/caches.

## 4. Checklist avant merge d'une page plein-ecran autonome

- [ ] `overflow-x-clip` sur la racine ; colonnes `min-w-0` ; panneau `shrink-0` + breakpoint.
- [ ] Debordement horizontal = 0 mesure a 320 -> 1440px.
- [ ] Scroll vertical de la page d'entree = 0 mesure a 660 -> 810px de hauteur utile.
- [ ] Padding vertical height-aware (serre par defaut, genereux `min-height:820px`).
- [ ] Honeypot / champs caches sans offset negatif.
- [ ] Verifie dark ET light ; build frais (serveur non-zombie) ; 5 portes vertes.
