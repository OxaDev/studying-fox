FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY validated_courses ./validated_courses

RUN useradd --system --uid 1000 renard && mkdir -p /srv/medias && chown renard /srv/medias
USER renard

EXPOSE 8000

# Les migrations passent avant chaque démarrage.
# L'API n'est joignable que par Caddy : on se fie à ses en-têtes X-Forwarded-For
# pour connaître l'adresse IP réelle (limitation des tentatives).
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'"]
