# 0005 — Base de données : PostgreSQL

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Il faut stocker les utilisateurs, les leçons avec leurs versions, les parcours et la progression.
Il faut aussi une recherche en français, sur un serveur unique et à petit budget.

## Décision

On utilise **PostgreSQL 17** comme base de données unique.

## Conséquences

- ✅ Une seule brique fait la base de données et la recherche plein texte en français (voir [0007](0007-recherche-postgresql.md)).
- ✅ Les transactions garantissent la cohérence des publications et des versions.
- ✅ Outil gratuit, connu et bien documenté.
- ⚠️ Il faut mettre en place des sauvegardes quotidiennes et tester une restauration (voir [0012](0012-hebergement-vps-docker.md)).

## Alternatives écartées

- **SQLite** : limité pour les écritures simultanées, et sa recherche en français est moins bonne.
- **MongoDB** : nos données sont très relationnelles (leçons, parcours, progression).
