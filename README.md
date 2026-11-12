# galilou-site

## Listes de mots prêtes (`listes/`)

Les pages `listes/*.html`, la page `listes/index.html` et le bloc `listes-pretes` de `sitemap.xml` sont générés à partir de la bibliothèque de listes de l'application (`apps/mobile/lib/ready-lists-library.ts` dans le dépôt `stellorior/galilou`). Ne pas les modifier à la main : corriger la source, puis régénérer.

Depuis la racine de ce dépôt (Node 18 ou plus, aucune dépendance) :

```bash
node tools/build-ready-lists.mjs ../galilou/apps/mobile/lib/ready-lists-library.ts
```

Le chemin est celui du fichier `ready-lists-library.ts` sur votre machine. Le script réécrit toutes les pages, supprime celles des listes retirées et met à jour le sitemap ; le relancer sans changement de la source ne modifie rien. Les conseils de révision (un par thème) et les libellés de thèmes sont dans le script.

Chaque page porte le bouton « Faire cette dictée dans Galilou » avec le lien de campagne App Store `ct=liste-<slug>`.
