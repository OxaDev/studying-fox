# 0011 — Contenus générés par IA

- **Statut** : Remplacé par [0019](0019-import-lecons-json.md)
- **Date** : 2026-10-05

## Contexte

Des agents IA vont enrichir les cours. Une IA peut se tromper. Le contenu doit rester fiable, et les apprenants doivent savoir qu'une IA a participé à sa rédaction.

## Décision

- L'agent IA est un **utilisateur comme un autre**, avec le rôle « Agent IA » et une clé d'API (voir [0008](0008-authentification.md)).
- Il passe par **l'API publique**, sans accès direct à la base.
- Il ne peut que **créer des brouillons et les soumettre**. Il ne publie jamais.
- Chaque révision indique si elle a été rédigée **avec l'aide d'une IA**. L'apprenant voit une mention claire sur la leçon.
- Les exemples de code produits par l'IA doivent être **testés** avant la relecture : l'agent les exécute et joint le résultat.

## Conséquences

- ✅ Même circuit, mêmes garde-fous, pour les humains et pour l'IA.
- ✅ Les apprenants sont informés de façon transparente.
- ⚠️ Risque de submerger les relecteurs. Il faut limiter le nombre de brouillons en attente par agent.
- ⚠️ Le fournisseur d'IA et son coût restent à choisir (voir la question ouverte n° 3 du cadrage).

## Alternatives écartées

- **Génération intégrée au back** (l'API appelle elle-même une IA) : elle mélange les responsabilités et lie le back à un fournisseur. On pourra la reconsidérer plus tard.
