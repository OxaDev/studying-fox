# 1. Construit le front React.
FROM node:26-slim AS front
WORKDIR /front
COPY front/package.json front/package-lock.json ./
# npm ci lance scripts/copier-pyodide.mjs (Pyodide hébergé chez nous).
COPY front/scripts ./scripts
RUN npm ci
COPY front ./
# Lu par des tests, dont `tsc -b` vérifie aussi les types.
COPY docs/format-lecon/exemple.json /docs/format-lecon/exemple.json
# Chemin du site sous son domaine, ex. « /studying-fox » (ADR 0031). Vide : à la racine.
ARG CHEMIN_BASE=""
RUN RENARD_CHEMIN_BASE="$CHEMIN_BASE" npm run build

# 2. Caddy sert le front et redirige vers l'API.
FROM caddy:2
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=front /front/dist /srv/app
