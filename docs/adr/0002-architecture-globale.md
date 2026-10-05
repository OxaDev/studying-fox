# 0002 — Architecture : un front React séparé d'une API

- **Statut** : Accepté. Adresses précisées par [0020](0020-decoupage-des-adresses.md).
- **Date** : 2026-10-05

## Contexte

Le porteur du projet a choisi React pour le front et FastAPI (Python) pour le back.
L'agent IA qui produit les brouillons doit pouvoir passer par la même API que le site.

## Décision

On construit deux applications séparées :

- un **front React** : une application web monopage (SPA), servie sous forme de fichiers statiques ;
- une **API REST FastAPI**, qui est la seule à accéder à la base PostgreSQL.

Elles communiquent en JSON sur le même domaine : `/` pour le front, `/api` pour l'API.

## Conséquences

- ✅ Une seule API pour le site, l'interface d'administration et l'agent IA.
- ✅ Le front et le back se testent et se déploient séparément.
- ✅ Un seul domaine : pas de configuration CORS, et des cookies plus simples à sécuriser.
- ⚠️ Il faut garder le contrat d'API à jour. Le schéma OpenAPI généré par FastAPI fait foi.
- ⚠️ Une SPA est mal référencée par les moteurs de recherche. Les pages publiques sont donc générées à part (voir [0016](0016-pages-publiques-referencement.md)).

## Alternatives écartées

- **Next.js, avec rendu côté serveur** : il ajoute un serveur Node en plus de Python. C'est inutile tant que le contenu est derrière une connexion.
- **Un seul serveur Python qui génère les pages (Jinja)** : ce n'est pas le choix du porteur, et ça convient mal à un éditeur de code interactif.
