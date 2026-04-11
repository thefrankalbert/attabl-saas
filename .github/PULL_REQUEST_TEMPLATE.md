## Description

<!-- Decris brievement les changements -->

## Type de changement

- [ ] Bug fix
- [ ] Nouvelle feature
- [ ] Refactoring
- [ ] Style / UI
- [ ] Documentation

## Checklist Responsive

Si ce PR touche a l'UI (composants, styles, layout) :

- [ ] Pas de `w-[Xpx]` ajoute (utiliser `w-full max-w-[Xpx]` a la place)
- [ ] Les composants reutilisables utilisent `@container` (pas `md:`)
- [ ] Teste aux 3 viewports : 375px (mobile), 768px (tablette), 1024px (desktop)
- [ ] Pas de `style={{}}` avec des valeurs statiques (utiliser des classes Tailwind)
- [ ] Tests E2E responsive passent (`pnpm test:e2e:responsive`)

## Checklist Securite

Si ce PR touche aux API routes, auth, ou donnees :

- [ ] Validation Zod sur les entrees utilisateur
- [ ] Rate limiting applique sur les endpoints publics
- [ ] Requetes DB filtrent par `tenant_id`
- [ ] Pas de secrets en dur dans le code
