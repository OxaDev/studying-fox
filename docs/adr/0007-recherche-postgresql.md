# 0007 — Recherche : plein texte de PostgreSQL

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Les utilisateurs doivent pouvoir chercher des leçons et des parcours en français, avec des filtres.
Le volume restera modeste : quelques milliers de leçons au plus.

## Décision

On utilise la **recherche plein texte de PostgreSQL** avec la configuration `french`.

- Un index `tsvector` porte sur le titre, le résumé et le contenu de la révision publiée. Le titre pèse le plus.
- L'extension `unaccent` permet de trouver « réseau » en tapant « reseau ».
- L'extension `pg_trgm` tolère les petites fautes de frappe.

## Conséquences

- ✅ Aucune brique à ajouter.
- ✅ Les résultats sont toujours synchronisés avec les données.
- ⚠️ La pertinence est moins fine qu'avec un moteur dédié. On réévaluera si les utilisateurs s'en plaignent.

## Alternatives écartées

- **Meilisearch / Elasticsearch** : un service de plus à héberger et à synchroniser, injustifié pour ce volume.
