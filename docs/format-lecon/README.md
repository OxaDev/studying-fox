# Format des leçons à importer

Ce guide s'adresse à **toute personne ou tout agent IA qui rédige des leçons** pour Le Renard Étudiant.
On produit un fichier, un utilisateur l'importe dans la plateforme, puis il relit et publie (voir [ADR 0019](../adr/0019-import-lecons-json.md)).

## Les fichiers

| Fichier | Rôle |
|---|---|
| [lecons.schema.json](lecons.schema.json) | Le format officiel (JSON Schema). Il fait foi. |
| [exemple.json](exemple.json) | Un paquet complet : un parcours de deux leçons. |
| [vba.md](vba.md) | Ce qu'il faut savoir pour écrire des leçons VBA. |

- **Sans image** : un seul fichier `.json`. Les **illustrations** (schémas en SVG) sont écrites dans ce fichier.
- **Avec images** : une archive `.zip` qui contient `lecons.json` à la racine et un dossier `images/`.

## Structure d'un paquet

```
paquet
├── format, version      → "renard-etudiant/lecons", et 4 (la version actuelle)
├── generation           → assisté par IA ? quel outil ? quelle date ?
├── parcours (facultatif)→ id, slug, ordre… : regroupe les leçons dans un ordre
└── lecons[]             → 1 à 50 leçons
    ├── id, slug, titre, resume, theme, niveau, duree_minutes
    ├── prerequis, objectifs
    ├── blocs[]          → texte | code | exercice | encadre | image | illustration
    └── sources
```

## Les versions du format

| Version | Ce qu'elle ajoute |
|---|---|
| 1 | Le format de départ |
| 2 | Le bloc `exercice` |
| 3 | Un **identifiant** (`id`) obligatoire sur chaque leçon et sur le parcours |
| 4 | Le bloc `illustration` |

**Écris tes paquets en version 4.** Les versions précédentes restent acceptées à l'import. En versions 1 et 2, la leçon est retrouvée par son slug.

## Les identifiants (version 3 et plus)

Chaque leçon et le parcours ont un `id` : un **UUID**, qui devient leur identifiant sur la plateforme (voir [ADR 0025](../adr/0025-parcours-valides.md)).

```json
{
  "id": "2f7d9b3c-5a64-4e18-b0c2-7d3e9a1f6c58",
  "slug": "afficher-du-texte-en-python",
  "titre": "Afficher du texte"
}
```

- **Une nouvelle leçon, un nouvel `id`.** Pour en générer un : `python3 -c "import uuid; print(uuid.uuid4())"`. N'invente pas l'UUID à la main, et ne copie pas celui de l'exemple.
- **L'`id` ne change jamais.** Pour une nouvelle version d'une leçon existante, garde son `id` : l'import crée une nouvelle version de cette leçon, jamais un doublon.
- **Le slug d'une leçon existante ne change pas non plus.** L'import refuse un `id` connu avec un autre slug, et un slug déjà pris par une leçon d'un autre `id`.

## L'ordre des parcours

Dans le catalogue, les thèmes et les parcours suivent l'**ordre d'apprentissage** (voir [ADR 0030](../adr/0030-ordre-d-apprentissage.md)).

- Le champ `ordre` du parcours donne sa place **dans son thème** : 1 pour le premier à suivre, puis 2, 3… Un parcours qui dépend d'un autre vient après lui.
- Il est facultatif : un parcours sans `ordre` vient après les autres, par titre.
- L'ordre des thèmes est celui des thèmes par défaut, dans `api/app/lecons/themes.py`. Les autres thèmes viennent ensuite, par nom.

```json
"parcours": {
  "slug": "daggerheart-creer-son-personnage",
  "theme": "daggerheart",
  "ordre": 2
}
```

## Les 6 types de blocs

| Type | À quoi il sert | Champs |
|---|---|---|
| `texte` | Expliquer | `markdown` |
| `code` | Montrer, ou faire essayer si `executable: true` | `langage` (python, javascript, vba), `code`, `executable`, `sortie_attendue` |
| `exercice` | Faire pratiquer : une consigne, un code de départ, une solution masquée. **Version 2 du format.** | `langage`, `consigne`, `code`, `solution`, `sortie_attendue` |
| `encadre` | Mettre en avant | `variante` (astuce, attention, a_retenir), `markdown` |
| `image` | Illustrer avec un fichier (photo, dessin fait à la main) | `fichier`, `alt`, `legende`, `licence`, `source` |
| `illustration` | Illustrer avec un schéma en SVG, écrit dans le paquet. **Version 4 du format.** | `svg`, `alt`, `description`, `legende` |

## Les exercices (version 2)

Un exercice ressemble à un bloc de code exécutable, avec deux ajouts :

- la **consigne** (Markdown simple), affichée au-dessus du code ;
- la **solution**, masquée sous la console. L'apprenant l'affiche ou la masque d'un clic, et ne peut pas la modifier.

```json
{
  "type": "exercice",
  "langage": "python",
  "consigne": "Affiche le **double** de `n`.",
  "code": "n = 21\n# À toi de jouer\n",
  "solution": "n = 21\nprint(n * 2)\n",
  "sortie_attendue": "42\n"
}
```

- Le paquet doit déclarer `"version": 2` ou plus. Un fichier en version 1 reste accepté, mais sans exercice.
- À l'import, c'est la **solution** qui est exécutée et comparée à `sortie_attendue`. Le code de départ ne l'est pas : il peut être incomplet.
- Une bonne consigne dit précisément ce que le programme doit afficher. Le code de départ prépare les données, et laisse un commentaire là où l'apprenant doit écrire.

## Les illustrations (version 4)

Une illustration est un **SVG écrit directement dans le paquet**. La plateforme le redessine dans le thème de l'apprenant (clair ou sombre) : voir [ADR 0029](../adr/0029-illustrations-vectorielles.md).
C'est l'outil des **schémas** : plateau de jeu, cartes, positions, flèches, boîtes, étapes. Pour un dessin figuratif (personnage, scène), utilise plutôt un bloc `image`.

```json
{
  "type": "illustration",
  "svg": "<svg viewBox=\"0 0 400 200\"><rect x=\"20\" y=\"20\" width=\"160\" height=\"160\" rx=\"12\" fill=\"illu-bois-clair\" stroke=\"illu-noir\" stroke-width=\"3\"/>…</svg>",
  "alt": "Plateau de dames en début de partie",
  "description": "Un damier de 10 cases sur 10. Les pions noirs occupent les 4 premières rangées, les pions blancs les 4 dernières. Les 2 rangées du milieu sont vides.",
  "legende": "La position de départ"
}
```

- `alt` : ce que montre l'illustration, en une phrase.
- `description` : tout ce qu'il faut savoir pour comprendre la leçon **sans voir** l'illustration. Elle s'affiche sous l'illustration, à la demande.
- `legende` : une ligne, sans accent grave. Facultative.

**Ce que le SVG peut contenir**, et rien d'autre (la liste exacte est dans [regles.json](../../front/src/features/lecons/illustration/regles.json)) :

| Quoi | Éléments |
|---|---|
| Formes | `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path` |
| Texte | `text`, `tspan` |
| Structure | `g`, `defs`, `use`, `symbol`, `marker` (pointes de flèche) |
| Dégradés | `linearGradient`, `radialGradient`, `stop` |

- Le `<svg>` a un **`viewBox`**. Pas de `<title>` ni de `<desc>` : ils viennent de `alt` et de `description`.
- Attributs : géométrie (`x`, `cx`, `d`, `points`…), `transform`, trait (`stroke-width`, `stroke-dasharray`, `stroke-linecap`…), texte (`font-size`, `font-weight`, `text-anchor`, `dominant-baseline`), opacités, `id`.
- Les liens (`href`, `marker-end`, `fill="url(…)"`) visent seulement un `#id` du même SVG.
- **Interdits** : `<script>`, `<style>`, `<image>`, `<foreignObject>`, les attributs `style`, `class` et `on…`, `xlink:href`, le `DOCTYPE`. Pas de police : celle du site est imposée.
- Au plus 100 000 caractères et 2 000 éléments.

**Les couleurs sont des noms**, jamais des codes (`fill="illu-rouge"`, pas `fill="#de5161"` ni `fill="red"`). Sans couleur, une forme ou un texte prend la couleur du texte du site.

| Nom | Dans le thème sombre | Pour quoi |
|---|---|---|
| `texte`, `texte-doux`, `primaire`, `turquoise`, `succes`, `erreur`, `bordure`, `surface`, `fond` | **Changent** : ce sont les couleurs du site | Traits, flèches, texte posé sur le fond de l'illustration |
| `peche`, `menthe`, `soleil`, `sakura`, `ciel` | Ne changent pas : toujours clairs | Fonds de zones, de cases, de boîtes |
| `illu-blanc`, `illu-noir`, `illu-gris`, `illu-rouge`, `illu-orange`, `illu-jaune`, `illu-vert`, `illu-bleu`, `illu-violet`, `illu-bois-clair`, `illu-bois-fonce` | Ne changent pas | Ce qui a une couleur **dans la réalité** : pions blancs et noirs, cartes rouges, plateau en bois |

Plus `none`, et `url(#id)` pour un dégradé.

**Règles de dessin**
- Le fond de l'illustration est celui du site : blanc en thème clair, bleu nuit en thème sombre. Ne dessine pas de fond, sauf s'il fait partie du sujet (un plateau, une table).
- **Sur un pastel ou une couleur `illu-*`, écris et trace en `illu-*`** (souvent `illu-noir`), jamais en `texte` : en thème sombre, `texte` devient clair et disparaît sur un fond clair.
- `illu-blanc`, `illu-noir`, `illu-jaune` et `illu-bois-clair` se confondent avec le fond d'un des deux thèmes : donne-leur un **contour** (`stroke`) d'une couleur moyenne ou opposée.
- La couleur ne porte jamais seule une information : ajoute une forme, un motif ou un libellé (RGAA 3.1).
- Un `viewBox` de **400 à 600 de large**, et du texte d'au moins **20** de haut (`font-size`) : sur un téléphone, l'illustration rétrécit avec son texte.
- Peu de texte dans l'image. Les explications vont dans les blocs `texte`.

**Regarde ton illustration avant de l'envoyer.** Le SVG se trompe souvent sans qu'on le voie dans le code : texte qui déborde, formes qui se chevauchent, flèche à l'envers.

```bash
cd front && npm run illustration -- ../chemin/mon-paquet.json
```

La commande fait le même contrôle que l'import, puis une capture de chaque illustration avec le vrai rendu de la plateforme : thème clair, thème sombre et téléphone. Elle affiche le chemin des fichiers PNG : ouvre-les, corrige, recommence.
Elle accepte aussi un fichier `.svg` seul, qui contient alors son `<title>` et son `<desc>`. Il faut Chromium pour Playwright (`npx playwright install chromium`).

## Règles de rédaction

**Le fond**
- Une leçon = **une seule notion**, lisible en **5 à 15 minutes**.
- Public : des adultes débutants ou de niveau intermédiaire. On ne suppose aucune connaissance qui n'est pas listée dans `prerequis`.
- 1 à 5 **objectifs**, qui commencent par un verbe : « Créer une variable ».
- Chaque notion est illustrée par **au moins un bloc de code exécutable**.

**La forme**
- En **français**, en tutoyant l'apprenant.
- Ton encourageant mais **jamais scolaire** : l'apprenant est un professionnel adulte.
- Phrases courtes. Un paragraphe = une idée.
- On définit chaque mot technique la première fois qu'on l'utilise.
- Markdown simple : gras, italique, `code`, listes, titres `##` au maximum. **Pas de HTML.**

**Le code**
- Python 3, JavaScript moderne ou VBA, rien d'autre. Pour le VBA, lis d'abord [vba.md](vba.md) : le code tourne sur un classeur Excel simulé.
- Le code doit **tourner tel quel** dans le navigateur : pas de réseau, pas de `input()` ni d'`InputBox`. Les fichiers temporaires (`tempfile`) marchent, dans un système de fichiers en mémoire.
- En Python, `await` est permis au niveau du module : on appelle une API FastAPI avec httpx (`AsyncClient` et `ASGITransport`). N'utilise pas `asyncio.run()`, ni de threads : écris les routes et dépendances FastAPI avec `async def`.
- Bibliothèques disponibles : celles de `front/scripts/paquets-python.json` (SQLAlchemy, Alembic, FastAPI, Pydantic, httpx, Django, Django REST Framework). Elles sont chargées d'après les `import` du code. Pour une autre bibliothèque, ajoute-la au manifeste ([ADR 0028](../adr/0028-bibliotheques-python.md)).
- Django n'a pas de fichiers de projet dans le navigateur : chaque exemple commence par un préambule qui configure un mini-projet (`settings.configure`, une application en mémoire, une base SQLite temporaire). Les parcours Django du dossier `api/validated_courses/` en donnent le modèle.
- Indique `sortie_attendue` dès que le code affiche quelque chose. La plateforme la compare au résultat réel au moment de l'import.

**Les droits**
- Le contenu est publié sous **CC BY-SA 4.0** (voir [ADR 0017](../adr/0017-licence-contenus-cc-by-sa.md)).
- Pas de copier-coller depuis une source sous droits.
- Images : `alt` obligatoire. Indique la `source` si ce n'est pas une création originale.
- Illustrations : ce sont des créations originales. Ne recopie pas le dessin d'un livre de règles ou d'un site.

## Avant d'envoyer le fichier

1. Le fichier est valide par rapport au schéma :
   `check-jsonschema --schemafile lecons.schema.json mon-paquet.json`
2. Chaque exemple de code, et chaque solution d'exercice, a été exécuté, et sa sortie correspond à `sortie_attendue`. L'outil de la plateforme vérifie tout le paquet d'un coup, dans les mêmes conditions que le navigateur, illustrations comprises : `cd front && npm run verifier -- mon-paquet.json`.
3. Tu as **regardé** chaque illustration, en thème clair, en thème sombre et sur téléphone : `cd front && npm run illustration -- mon-paquet.json`.
4. Chaque leçon et le parcours ont un `id` (UUID) : nouveau pour une nouvelle leçon, repris tel quel pour une leçon existante. Les `slug` sont uniques et parlants.
5. Les thèmes utilisés existent déjà sur la plateforme : `python-bases`, `python-poo`, `python-django`, `python-fastapi`, `javascript`, `vba-bases`, `daggerheart`.

## Après l'import

1. Chaque leçon devient un **brouillon**, visible seulement dans la file de relecture.
2. La personne qui importe le relit et décide : **publier**, **demander des corrections** ou **refuser** (un commentaire est alors obligatoire).
   Pour publier plusieurs leçons d'un coup, coche-les : juste après l'import (toutes cochées : tout le parcours est publié), ou dans la file de relecture. Chaque leçon garde sa propre décision dans l'historique.
3. Une leçon publiée apparaît pour les apprenants. Un parcours apparaît dès qu'une de ses leçons est publiée, et il ne montre que ses leçons publiées.
4. Réimporter une leçon existante (même `id`) crée une **nouvelle version**. L'ancienne reste en ligne tant que la nouvelle n'est pas publiée, et l'historique garde toutes les versions.

## Les parcours validés

Un parcours relu et prêt peut rejoindre le dossier [`api/validated_courses/`](../../api/validated_courses/README.md), dans une pull request.
Au démarrage, l'API crée et **publie** ce qui manque en base. Une base vidée retrouve donc ces parcours sans réimport ni nouvelle relecture.

- Un fichier = un paquet en **version 3 ou plus**, avec **un parcours et toutes ses leçons**. Pas de bloc `image` pour l'instant, mais les illustrations sont acceptées.
- La relecture se fait **dans la pull request** : le fichier est publié tel quel.
- Ce qui existe déjà en base (même `id`) **n'est pas modifié** : le fichier sert à reconstruire une base vide, pas à corriger une leçon en ligne. Pour une correction, passe par l'éditeur ou l'import.
- Un test vérifie chaque fichier du dossier. Au démarrage, un fichier invalide est signalé dans les logs et ignoré.
- Chaque parcours validé a un `ordre` dans son thème. Comme le reste, il n'est lu qu'à la création : pour changer l'ordre d'un parcours déjà en base, il faut une migration (voir la migration 0008).

À la main : `cd api && uv run python -m app.imports.parcours_valides`.
