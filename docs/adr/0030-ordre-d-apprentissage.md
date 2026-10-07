# 0030 — Thèmes et parcours dans l'ordre d'apprentissage

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Complète** : [0019](0019-import-lecons-json.md) (format d'import) et [0025](0025-parcours-valides.md) (parcours validés)

## Contexte

Le catalogue triait les thèmes par nom et les parcours par titre. Un apprenant voyait « Daggerheart : combat » avant « Daggerheart : découvrir le jeu », et « Python - Django » avant « Python - Programmation Orientée Objet », dont il dépend.
Un thème doit pouvoir s'aborder dans l'ordre des choses à apprendre.

## Décision

**Les thèmes et les parcours sont listés dans l'ordre d'apprentissage.**

- **Les thèmes** : l'ordre est celui des thèmes par défaut, dans `api/app/lecons/themes.py` (Python - Bases, POO, Django, FastAPI, JavaScript, VBA, Daggerheart). Les thèmes créés dans l'administration viennent après, par nom.
- **Les parcours** : une colonne `ordre` donne la place du parcours dans son thème. Elle vient du champ facultatif `parcours.ordre` du format d'import (sans changer la version du format). Un parcours sans ordre vient après les autres, par titre.
- L'ordre s'applique à la liste des parcours (application et vitrine) et à la liste des leçons. La recherche garde son tri par pertinence, et l'accueil ses nouveautés.
- Les parcours validés déjà en base ne sont jamais modifiés au démarrage : la migration 0008 remplit leur ordre.

## Conséquences

- ✅ Les filtres par thème et la liste « Tous » se lisent de haut en bas, comme un programme.
- ✅ Le format reste compatible : les paquets sans `ordre` sont toujours acceptés.
- ⚠️ L'ordre des thèmes est dans le code : ajouter un thème par défaut, c'est aussi choisir sa place.
- ⚠️ Changer l'ordre d'un parcours validé déjà en base demande une migration, ou un réimport du paquet.

## Alternatives écartées

- **Un ordre des thèmes en base, modifiable dans l'administration** : plus souple, mais il faut un écran de plus. Les thèmes par défaut couvrent aujourd'hui tous les contenus.
- **Déduire l'ordre des prérequis des leçons** : les prérequis entre parcours ne suffisent pas à départager deux parcours indépendants, et un cycle bloquerait le tri.
