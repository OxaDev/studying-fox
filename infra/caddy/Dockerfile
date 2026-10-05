# 1. Construit le front React.
FROM node:22-slim AS front
WORKDIR /front
COPY front/package.json front/package-lock.json ./
# npm ci lance scripts/copier-pyodide.mjs (Pyodide hébergé chez nous).
COPY front/scripts ./scripts
RUN npm ci
COPY front ./
RUN npm run build

# 2. Caddy sert le front et redirige vers l'API.
FROM caddy:2
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=front /front/dist /srv/app
