# 0029 — Illustrations vectorielles écrites dans la leçon

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Complète** : [0006](0006-contenus-en-base.md) (Markdown en base), [0013](0013-accessibilite-rgaa.md) (RGAA) et [0019](0019-import-lecons-json.md) (format d'import)

## Contexte

De nouveaux parcours sortent de la programmation, par exemple des règles de jeux. Ils ont besoin de schémas : plateaux, cartes, positions, flèches de déplacement.
Les leçons sont écrites par un agent IA (Claude Opus), qui ne produit pas d'images matricielles. En revanche, il écrit très bien du SVG, qui est une liste de formes.
Le bloc `image` accepte déjà un fichier `.svg`, mais il faut une archive zip, les parcours validés n'en acceptent pas, et une image chargée par `<img>` ne suit pas le thème choisi ([0024](0024-choix-du-theme.md)).

## Décision

**Un nouveau bloc `illustration`, dont le SVG est écrit dans la leçon et limité par une liste blanche.** Format d'import en version 4.

- **Dans le paquet** : `{"type": "illustration", "svg": "<svg viewBox=…>…</svg>", "alt": "…", "description": "…", "legende": "…"}`. `alt` et `description` sont obligatoires.
- **En Markdown** : un bloc de code ```` ```illustration ````. `alt` et `description` y deviennent le `<title>` et le `<desc>` du SVG, et la légende est indiquée après le mot `illustration`. Un contributeur peut l'écrire dans l'éditeur.
- **La liste blanche** : formes (`rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`), texte (`text`, `tspan`), structure (`g`, `defs`, `use`, `symbol`, `marker`), dégradés (`linearGradient`, `radialGradient`, `stop`), et leurs attributs de géométrie, de trait et de texte. Pas de `<script>`, `<style>`, `<foreignObject>`, `<image>`, attribut `style`, `class` ni `on*`. Les liens (`href`, `url(…)`) visent seulement un `#id` du même SVG. Pas de `DOCTYPE` ni d'entités. Au plus 100 Ko et 2 000 éléments.
- **Les couleurs sont des noms**, par exemple `fill="primaire"` ou `stop-color="illu-rouge"`, et jamais des codes. Chaque nom correspond à un jeton de `tokens.css` :
  - les couleurs de l'interface (`texte`, `trait`, `surface`…) changent avec le thème ;
  - de nouveaux jetons `--illu-*` (`blanc`, `noir`, `rouge`…) **ne changent pas** avec le thème, parce qu'ils ont un sens dans le jeu : un pion blanc reste blanc.
  - Les couleurs moyennes ont un contraste d'au moins 3:1 sur la surface des deux thèmes (RGAA 3.3). Le blanc, le noir et les plus claires ne peuvent pas l'avoir dans les deux : elles prennent un contour.
- **La police est imposée** : la police du texte, hébergée chez nous. L'agent ne choisit que la taille et la graisse.
- **Contrôle à l'import** (API) : un SVG hors liste blanche est refusé, et le message nomme l'élément ou l'attribut en cause.
- **Contrôle à l'affichage** (front) : le SVG est relu avec `DOMParser`, et **seuls les éléments de la liste blanche** sont recréés en éléments React. Il n'y a jamais d'`innerHTML`. Le contenu tapé dans l'éditeur est donc protégé lui aussi.
  - La liste blanche est un fichier JSON partagé par l'API et le front.
- **Accessibilité** : `role="img"`, nom accessible tiré de `alt`. La `description` détaillée est aussi affichée en texte, dans un `<details>` « Description de l'illustration » (RGAA 1.6, images complexes), car les lecteurs d'écran lisent mal `<desc>`.
- **Vérification visuelle par l'agent** : `npm run illustration -- paquet.json` affiche chaque illustration avec le vrai composant, dans Playwright. Il en tire une capture PNG en thème clair, une en thème sombre et une sur téléphone. L'agent regarde ces captures et corrige son dessin avant d'envoyer le paquet. `npm run verifier` contrôle aussi la liste blanche.

## Conséquences

- ✅ Un paquet reste un simple fichier JSON, et les parcours validés peuvent contenir des illustrations.
- ✅ Les illustrations suivent le thème et la charte, sans couleur en dur.
- ✅ Il n'y a ni HTML brut ni nouveau chemin d'injection : le rendu ne crée que des éléments connus.
- ✅ Il n'y a pas de nouvelle dépendance : le front utilise `DOMParser`, et la vérification utilise Playwright.
- ⚠️ Un SVG n'est fiable que pour des schémas. Pour un dessin figuratif (personnage, scène), le bloc `image` avec un fichier fait à la main reste la solution.
- ⚠️ Deux implémentations de la liste blanche (Python et TypeScript) partagent la même liste. Les mêmes cas de test sont joués des deux côtés.
- ⚠️ La recherche ([0007](0007-recherche-postgresql.md)) doit retirer le SVG de son index, et ne garder que `alt` et `description`.
- ⚠️ Sur un petit écran, le dessin rétrécit avec son texte. Le guide de rédaction fixe une largeur de `viewBox` et une taille de texte minimale.
- ⚠️ La liste blanche et la palette sont un contrat : les élargir ne pose pas de problème, mais les restreindre casse des leçons existantes.

## Alternatives écartées

- **Un format de formes maison en JSON** : l'agent devrait l'apprendre dans notre documentation, alors qu'il connaît déjà le SVG. Ce format serait aussi moins expressif, et il faudrait le maintenir. Un SVG limité offre les mêmes garanties.
- **Le bloc `image` avec un fichier `.svg`** : il demande une archive zip, il ne suit pas le thème choisi, et il est impossible à écrire dans l'éditeur.
- **Nettoyer le SVG avec DOMPurify, puis l'insérer avec `innerHTML`** : cette solution ajoute une dépendance et un chemin d'insertion de HTML brut, contraire à la règle « Markdown affiché sans HTML brut ».
- **Des blocs spécialisés par jeu** (par exemple un plateau d'échecs décrit en notation FEN) : plus fiables pour leur jeu, mais il en faudrait un par jeu. On pourra en ajouter plus tard, en plus des illustrations.
- **Des images générées par un modèle de diffusion** : il faut un service externe ([0014](0014-rgpd.md)), la licence est incertaine, et le résultat est imprécis pour un schéma.
