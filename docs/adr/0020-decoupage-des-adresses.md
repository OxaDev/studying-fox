# 0020 — Découpage des adresses du site

- **Statut** : Accepté
- **Date** : 2026-10-05
- **Modifie** : [0002](0002-architecture-globale.md). Le front passe de `/` à `/app`.

## Contexte

Trois choses partagent le même domaine : l'API ([0002](0002-architecture-globale.md)), la vitrine générée par FastAPI ([0016](0016-pages-publiques-referencement.md)) et l'application React.
Caddy doit savoir où envoyer chaque requête, sans ambiguïté.

## Décision

| Adresse | Servie par | Contenu |
|---|---|---|
| `/api/…` | FastAPI | API REST, schéma OpenAPI (`/api/openapi.json`) |
| `/app/…` | Caddy (fichiers du front) | Application React : connexion, leçons, espace, contribution, admin |
| `/medias/…` | Caddy (disque) | Images des leçons |
| tout le reste | FastAPI | Vitrine : `/`, `/parcours`, `/parcours/{slug}`, pages légales, `sitemap.xml`, `robots.txt` |

- Le bouton « Commencer » de la vitrine mène à `/app/inscription`.
- L'application React est construite avec `base: "/app/"` et un routeur avec `basename: "/app"`.
- Les pages sous `/app` portent `noindex` : seule la vitrine est référencée.

## Conséquences

- ✅ Une règle simple par préfixe, facile à lire dans le Caddyfile.
- ✅ Le référencement est clair : la vitrine est indexée, l'application ne l'est pas.
- ⚠️ Passer de la vitrine à l'application recharge la page. C'est acceptable, puisque ça n'arrive qu'à la connexion.

## Alternatives écartées

- **Application React à la racine, vitrine sous `/decouvrir`** : les adresses publiques, celles qu'on partage, seraient moins belles.
- **Sous-domaine `app.`** : il faudrait gérer CORS et des cookies sur deux domaines.
