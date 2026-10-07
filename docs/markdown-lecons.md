# Markdown des leçons

Le contenu d'une leçon est stocké en Markdown ([ADR 0006](adr/0006-contenus-en-base.md)).
Les agents qui écrivent des leçons utilisent le [format d'import](format-lecon/README.md) : la plateforme le convertit dans ce Markdown.
Cette page sert à ceux qui écrivent directement le Markdown, dans l'éditeur de contribution, et au code de rendu.
L'éditeur propose des boutons pour insérer les blocs ci-dessous et affiche un aperçu en direct.

## Ce qui est permis

| Élément | Syntaxe |
|---|---|
| Gras, italique | `**gras**`, `*italique*` |
| Code dans le texte | `` `print` `` |
| Listes | `- élément` ou `1. élément` |
| Intertitres | `## Titre` (le `#` est réservé au titre de la leçon) |
| Liens | `[texte](https://…)` |
| Images | `![texte alternatif](/medias/images/nom.png "légende")` |

Le **HTML brut est ignoré** : il n'est jamais affiché.

## Blocs de code

````markdown
```python
print("Simple exemple, non modifiable")
```

```python run
print("Exemple que l'apprenant peut modifier et lancer")
```
````

- Langages exécutables : `python`, `javascript` ([ADR 0009](adr/0009-execution-code-navigateur.md)) et `vba` ([ADR 0026](adr/0026-interpreteur-vba.md)).
- Le mot `run` après le langage rend le bloc exécutable.

## Encadrés

```markdown
> [!astuce]
> Modifie le texte, puis relance le code.
```

Trois variantes : `astuce`, `attention`, `a_retenir`.
Le titre (« Astuce », « Attention », « À retenir ») est ajouté à l'affichage.
Une citation sans marqueur reste une citation normale.

## Exercices

```markdown
> [!exercice]
> Affiche le **double** de `n`.
>
> ```python run
> n = 21
> # À toi de jouer
> ```
>
> ```python solution
> n = 21
> print(n * 2)
> ```
```

- Une citation qui commence par `[!exercice]` crée un exercice. Son contenu : la consigne, puis le code de départ (`run`), puis la solution.
- Le mot `solution` après le langage masque le bloc derrière un bouton « Afficher la solution ». Ce bloc n'est ni modifiable ni exécutable.
- Toutes les lignes de l'exercice, code compris, commencent par `> `. Le bouton « Exercice Python » de l'éditeur insère ce modèle.

## Illustrations

Un schéma en SVG, redessiné dans le thème de l'apprenant ([ADR 0029](adr/0029-illustrations-vectorielles.md)) :

````markdown
```illustration Légende de l'illustration
<svg viewBox="0 0 400 200">
  <title>Texte alternatif court</title>
  <desc>Description détaillée de ce que montre l'illustration.</desc>
  <rect x="20" y="20" width="360" height="160" rx="16" fill="ciel" stroke="illu-bleu" stroke-width="3"/>
  <text x="200" y="108" font-size="28" text-anchor="middle" fill="illu-noir">Bonjour !</text>
</svg>
```
````

- Ce qui suit `illustration` est la légende (facultative).
- Le `<title>` (texte alternatif) et le `<desc>` (description détaillée) sont obligatoires, directement dans le `<svg>`.
- Seuls les éléments et attributs de la liste blanche sont affichés, et les couleurs sont des noms de la palette : voir [les illustrations](format-lecon/README.md#les-illustrations-version-4) dans le guide du format.
- Un SVG refusé n'est pas affiché : un message dit pourquoi, dans l'aperçu comme sur la leçon.
- Le bouton « Illustration » de l'éditeur insère ce modèle.
