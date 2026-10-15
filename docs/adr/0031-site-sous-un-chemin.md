# 0031 — Servir le site sous un chemin, derrière un nginx

- **Statut** : Proposé
- **Date** : 2026-10-15
- **Complète** : [0012](0012-hebergement-vps-docker.md) et [0020](0020-decoupage-des-adresses.md)

## Contexte

Le site doit tourner sur une machine où nginx occupe déjà les ports 80 et 443 pour d'autres sites.
Il sera servi sous un chemin du domaine : `https://domain.com/studying-fox`.
Caddy ne peut donc plus gérer seul le HTTPS ([0012](0012-hebergement-vps-docker.md)), et toute adresse absolue (`/api`, `/app`, `/medias`) doit garder ce préfixe.

## Décision

- **nginx enlève le préfixe** et transmet à Caddy, sur `127.0.0.1:PORT_HTTP`, en simple HTTP. À l'intérieur, rien ne change : Caddy, l'API et les CSP voient `/api`, `/app`, `/medias` ([0020](0020-decoupage-des-adresses.md)).
- **Seules les adresses renvoyées au navigateur remettent le préfixe** :
  - front : `base` de Vite (`RENARD_CHEMIN_BASE`, au build). Le routeur, les appels à l'API et les images `/medias/…` des leçons en déduisent le chemin (`front/src/adresses.ts`) ;
  - API : le chemin de `RENARD_URL_PUBLIQUE`. Il préfixe les liens de la vitrine, `robots.txt` et le chemin du cookie de session. Pas de `root_path` : Starlette attend alors le préfixe dans l'adresse reçue, et ses `Mount` (`/statique`) ne trouvent plus leurs fichiers ;
  - Caddy : `CHEMIN_BASE`, pour la redirection `/app` et la CSP du worker Python.
- Une seule config, `infra/.env` : `DOMAINE` et `CHEMIN_BASE`. Le `Makefile` installe, met à jour et sauvegarde le site. `docker-compose.nginx.yml` s'ajoute à `docker-compose.yml` dans ce mode.
- Sans préfixe ni nginx, tout fonctionne comme avant (dev, tests, Caddy seul avec son HTTPS).

## Conséquences

- ✅ Le site cohabite avec d'autres sur la même machine, et son cookie reste sous son chemin.
- ✅ Les routes, le Caddyfile et les tests de bout en bout gardent leurs adresses actuelles.
- ⚠️ Changer `CHEMIN_BASE` demande de reconstruire l'image du front (`make deployer`).
- ⚠️ Derrière nginx, Caddy reçoit du HTTP : la CSP du worker Python désigne Pyodide en `http://`. Une source `http:` accepte aussi `https:` (CSP 3).
- ⚠️ `robots.txt` et `sitemap.xml` ne sont lus par les moteurs qu'à la racine du domaine : c'est au site principal de pointer vers notre sitemap.
- ⚠️ nginx doit **remplacer** `X-Forwarded-For` (et non le compléter), et Caddy faire confiance aux adresses privées : sinon la limitation des tentatives voit tout le monde avec la même adresse IP, ou une adresse choisie par le visiteur.

## Alternatives écartées

- **Sous-domaine (`studying-fox.domain.com`)** : rien à changer dans le code, mais ce n'est pas l'adresse voulue.
- **Garder le préfixe jusqu'à Caddy et l'API** : chaque route, chaque règle du Caddyfile et chaque test devraient le connaître.
