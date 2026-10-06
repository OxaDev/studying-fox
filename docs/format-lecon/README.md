# Format des leçons à importer

Ce guide s'adresse à **toute personne ou tout agent IA qui rédige des leçons** pour Le Renard Étudiant.
On produit un fichier, un utilisateur l'importe dans la plateforme, puis il relit et publie (voir [ADR 0019](../adr/0019-import-lecons-json.md)).

## Les fichiers

| Fichier | Rôle |
|---|---|
| [lecons.schema.json](lecons.schema.json) | Le format officiel (JSON Schema). Il fait foi. |
| [exemple.json](exemple.json) | Un paquet complet : un parcours de deux leçons. |
| [vba.md](vba.md) | Ce qu'il faut savoir pour écrire des leçons VBA. |

- **Sans image** : un seul fichier `.json`.
- **Avec images** : une archive `.zip` qui contient `lecons.json` à la racine et un dossier `images/`.

## Structure d'un paquet

```
paquet
├── format, version      → "renard-etudiant/lecons", et 3 (la version actuelle)
├── generation           → assisté par IA ? quel outil ? quelle date ?
├── parcours (facultatif)→ id, slug… : regroupe les leçons dans un ordre
└── lecons[]             → 1 à 50 leçons
    ├── id, slug, titre, resume, theme, niveau, duree_minutes
    ├── prerequis, objectifs
    ├── blocs[]          → texte | code | exercice | encadre | image
    └── sources
```

## Les versions du format

| Version | Ce qu'elle ajoute |
|---|---|
| 1 | Le format de départ |
| 2 | Le bloc `exercice` |
| 3 | Un **identifiant** (`id`) obligatoire sur chaque leçon et sur le parcours |

**Écris tes paquets en version 3.** Les versions 1 et 2 restent acceptées à l'import : la leçon est alors retrouvée par son slug.

## Les identifiants (version 3)

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

## Les 5 types de blocs

| Type | À quoi il sert | Champs |
|---|---|---|
| `texte` | Expliquer | `markdown` |
| `code` | Montrer, ou faire essayer si `executable: true` | `langage` (python, javascript, vba), `code`, `executable`, `sortie_attendue` |
| `exercice` | Faire pratiquer : une consigne, un code de départ, une solution masquée. **Version 2 du format.** | `langage`, `consigne`, `code`, `solution`, `sortie_attendue` |
| `encadre` | Mettre en avant | `variante` (astuce, attention, a_retenir), `markdown` |
| `image` | Illustrer | `fichier`, `alt`, `legende`, `licence`, `source` |

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
- Le code doit **tourner tel quel** dans le navigateur : pas de fichiers, pas de réseau, pas de `input()` ni d'`InputBox`.
- Indique `sortie_attendue` dès que le code affiche quelque chose. La plateforme la compare au résultat réel au moment de l'import.

**Les droits**
- Le contenu est publié sous **CC BY-SA 4.0** (voir [ADR 0017](../adr/0017-licence-contenus-cc-by-sa.md)).
- Pas de copier-coller depuis une source sous droits.
- Images : `alt` obligatoire. Indique la `source` si ce n'est pas une création originale.

## Avant d'envoyer le fichier

1. Le fichier est valide par rapport au schéma :
   `check-jsonschema --schemafile lecons.schema.json mon-paquet.json`
2. Chaque exemple de code, et chaque solution d'exercice, a été exécuté, et sa sortie correspond à `sortie_attendue`. Pour le VBA : `cd front && npm run vba -- mon-code.bas`.
3. Chaque leçon et le parcours ont un `id` (UUID) : nouveau pour une nouvelle leçon, repris tel quel pour une leçon existante. Les `slug` sont uniques et parlants.
4. Les thèmes utilisés existent déjà sur la plateforme (`python`, `javascript`, `vba`…).

## Après l'import

1. Chaque leçon devient un **brouillon**, visible seulement dans la file de relecture.
2. La personne qui importe le relit et décide : **publier**, **demander des corrections** ou **refuser** (un commentaire est alors obligatoire).
   Pour publier plusieurs leçons d'un coup, coche-les : juste après l'import (toutes cochées : tout le parcours est publié), ou dans la file de relecture. Chaque leçon garde sa propre décision dans l'historique.
3. Une leçon publiée apparaît pour les apprenants. Un parcours apparaît dès qu'une de ses leçons est publiée, et il ne montre que ses leçons publiées.
4. Réimporter une leçon existante (même `id`) crée une **nouvelle version**. L'ancienne reste en ligne tant que la nouvelle n'est pas publiée, et l'historique garde toutes les versions.

## Les parcours validés

Un parcours relu et prêt peut rejoindre le dossier [`api/validated_courses/`](../../api/validated_courses/README.md), dans une pull request.
Au démarrage, l'API crée et **publie** ce qui manque en base. Une base vidée retrouve donc ces parcours sans réimport ni nouvelle relecture.

- Un fichier = un paquet en **version 3**, avec **un parcours et toutes ses leçons**. Pas d'image pour l'instant.
- La relecture se fait **dans la pull request** : le fichier est publié tel quel.
- Ce qui existe déjà en base (même `id`) **n'est pas modifié** : le fichier sert à reconstruire une base vide, pas à corriger une leçon en ligne. Pour une correction, passe par l'éditeur ou l'import.
- Un test vérifie chaque fichier du dossier. Au démarrage, un fichier invalide est signalé dans les logs et ignoré.

À la main : `cd api && uv run python -m app.imports.parcours_valides`.
