# Format des leçons à importer

Ce guide s'adresse à **toute personne ou tout agent IA qui rédige des leçons** pour Le Renard Étudiant.
On produit un fichier, un utilisateur l'importe dans la plateforme, puis il relit et publie (voir [ADR 0019](../adr/0019-import-lecons-json.md)).

## Les fichiers

| Fichier | Rôle |
|---|---|
| [lecons.schema.json](lecons.schema.json) | Le format officiel (JSON Schema). Il fait foi. |
| [exemple.json](exemple.json) | Un paquet complet : un parcours de deux leçons. |

- **Sans image** : un seul fichier `.json`.
- **Avec images** : une archive `.zip` qui contient `lecons.json` à la racine et un dossier `images/`.

## Structure d'un paquet

```
paquet
├── format, version      → "renard-etudiant/lecons", et 1 ou 2 (2 pour utiliser des exercices)
├── generation           → assisté par IA ? quel outil ? quelle date ?
├── parcours (facultatif)→ regroupe les leçons dans un ordre
└── lecons[]             → 1 à 50 leçons
    ├── slug, titre, resume, theme, niveau, duree_minutes
    ├── prerequis, objectifs
    ├── blocs[]          → texte | code | exercice | encadre | image
    └── sources
```

## Les 5 types de blocs

| Type | À quoi il sert | Champs |
|---|---|---|
| `texte` | Expliquer | `markdown` |
| `code` | Montrer, ou faire essayer si `executable: true` | `langage` (python, javascript), `code`, `executable`, `sortie_attendue` |
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

- Le paquet doit déclarer `"version": 2`. Un fichier en version 1 reste accepté, mais sans exercice.
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
- Python 3 ou JavaScript moderne, rien d'autre.
- Le code doit **tourner tel quel** dans le navigateur : pas de fichiers, pas de réseau, pas de `input()`.
- Indique `sortie_attendue` dès que le code affiche quelque chose. La plateforme la compare au résultat réel au moment de l'import.

**Les droits**
- Le contenu est publié sous **CC BY-SA 4.0** (voir [ADR 0017](../adr/0017-licence-contenus-cc-by-sa.md)).
- Pas de copier-coller depuis une source sous droits.
- Images : `alt` obligatoire. Indique la `source` si ce n'est pas une création originale.

## Avant d'envoyer le fichier

1. Le fichier est valide par rapport au schéma :
   `check-jsonschema --schemafile lecons.schema.json mon-paquet.json`
2. Chaque exemple de code, et chaque solution d'exercice, a été exécuté, et sa sortie correspond à `sortie_attendue`.
3. Les `slug` sont uniques et parlants. Si un slug existe déjà sur la plateforme, l'import crée une **nouvelle version** de cette leçon : on ne crée pas de doublon.
4. Les thèmes utilisés existent déjà sur la plateforme (`python`, `javascript`…).

## Après l'import

1. Chaque leçon devient un **brouillon**, visible seulement dans la file de relecture.
2. La personne qui importe le relit et décide : **publier**, **demander des corrections** ou **refuser** (un commentaire est alors obligatoire).
   Pour publier plusieurs leçons d'un coup, coche-les : juste après l'import (toutes cochées : tout le parcours est publié), ou dans la file de relecture. Chaque leçon garde sa propre décision dans l'historique.
3. Une leçon publiée apparaît pour les apprenants. Un parcours apparaît dès qu'une de ses leçons est publiée, et il ne montre que ses leçons publiées.
4. Réimporter une leçon existante crée une **nouvelle version**. L'ancienne reste en ligne tant que la nouvelle n'est pas publiée, et l'historique garde toutes les versions.
