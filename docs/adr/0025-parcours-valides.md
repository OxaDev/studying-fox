# 0025 — Parcours validés dans le dépôt, identifiés par un UUID

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Précise** : [0019](0019-import-lecons-json.md) (format version 3, identité des leçons) et [0010](0010-circuit-de-relecture.md) (relecture des parcours validés).

## Contexte

Les parcours importés vivent seulement en base. Si on repart d'une base vide (nouveau serveur, volumes purgés), il faut tout réimporter, puis tout relire de nouveau.
Par ailleurs, l'import retrouve une leçon par son slug : renommer un slug, ou réutiliser un slug déjà pris par une autre leçon, crée un doublon ou écrase la mauvaise leçon.

## Décision

**Des identifiants dans le format (version 3).** Chaque leçon et le parcours d'un paquet ont un `id`, un UUID généré une fois pour toutes. Il devient leur identifiant en base.

- L'import retrouve une leçon ou un parcours par cet `id` : réimporter le même fichier crée une nouvelle version, jamais un doublon.
- Un `id` connu garde son slug. Un slug déjà pris par un autre `id` est refusé.
- Les versions 1 et 2, sans `id`, restent acceptées : le slug sert alors d'identifiant, comme avant.

**Un dossier de parcours validés : `api/validated_courses/`.** Chaque fichier `.json` y est un paquet en version 3, avec un parcours et toutes ses leçons.

- Au démarrage, l'API crée et **publie** ce qui manque en base. Ce qui existe déjà (même `id`) n'est jamais modifié.
- La relecture a lieu **dans la pull request** qui ajoute le fichier, et non sur la plateforme.
- Un fichier invalide est signalé dans les logs et ignoré. Un test vérifie chaque fichier du dossier en CI.

## Conséquences

- ✅ Une base vide retrouve les parcours validés sans réimport ni nouvelle relecture.
- ✅ Les parcours de référence sont versionnés dans Git, relus et historisés comme le code.
- ✅ Plus de doublon ni d'écrasement accidentel lié à un slug.
- ⚠️ Modifier un fichier ne met pas à jour une base en service : pour corriger une leçon déjà en ligne, on passe par l'éditeur ou l'import. Le fichier sert à reconstruire une base vide.
- ⚠️ Une leçon déjà en base sous un autre `id` (importée avant la version 3) bloque son fichier : il faut reprendre l'`id` de la base, ou repartir d'une base vide.
- ⚠️ Les leçons chargées n'ont pas d'auteur : elles affichent « Contributeur anonyme ».
- ⚠️ Pas encore d'images dans ce dossier.

## Alternatives écartées

- **Une colonne d'identifiant externe, à côté de la clé primaire** : une colonne et une migration de plus, pour un UUID qui peut être la clé primaire.
- **Écraser la base avec le contenu du fichier à chaque démarrage** : une correction faite sur la plateforme serait perdue au redémarrage suivant.
- **Une sauvegarde de la base** : utile, mais ne remplace pas une source relue et versionnée.
