# Parcours validés

Chaque fichier `.json` de ce dossier est un **parcours validé** : relu dans une pull request, il est publié tel quel.
Au démarrage, l'API crée et publie ce qui manque en base. Ce qui existe déjà (même `id`) n'est pas modifié.
Une base vidée retrouve donc ces parcours sans réimport (voir [ADR 0025](../../docs/adr/0025-parcours-valides.md)).

Règles (un test les vérifie) :

- le format est celui de [docs/format-lecon/](../../docs/format-lecon/README.md), en **version 3 ou plus** : chaque leçon et le parcours ont un `id` (UUID) ;
- un fichier contient **un parcours** et **toutes ses leçons** ;
- pas de bloc `image` pour l'instant, mais les **illustrations** (version 4, [ADR 0029](../../docs/adr/0029-illustrations-vectorielles.md)) sont acceptées ;
- un `id` ne change jamais, et n'est jamais réutilisé.

À la main : `uv run python -m app.imports.parcours_valides`.
