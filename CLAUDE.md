# Le Renard Étudiant — consignes pour les agents

Plateforme gratuite pour apprendre la programmation (Python, JavaScript) à des professionnels.
Le porteur du projet travaille seul : **c'est toi qui écris le code, lui qui relit**.

## À lire avant de coder

| Document | Quand |
|---|---|
| [docs/cadrage.md](docs/cadrage.md) | Toujours : besoins, rôles, modèle de données |
| [docs/adr/](docs/adr/README.md) | Avant tout choix technique. **Un ADR accepté s'applique, même si tu ferais autrement.** |
| [docs/feuille-de-route.md](docs/feuille-de-route.md) | Pour savoir sur quel jalon on travaille |
| [docs/identite-visuelle.md](docs/identite-visuelle.md) | Avant toute interface |
| [docs/format-lecon/](docs/format-lecon/README.md) | Pour écrire des leçons ou coder l'import |
| [docs/markdown-lecons.md](docs/markdown-lecons.md) | Pour le rendu ou l'édition du contenu des leçons |

Tu veux changer une décision ? N'enfreins pas l'ADR : propose un nouvel ADR (`Proposé`) et demande.

## Structure

```
api/     FastAPI + SQLAlchemy async + Alembic. Un dossier par domaine dans api/app/
         La vitrine publique (Jinja, sans JavaScript) est dans api/app/vitrine/
front/   React + TypeScript + Vite, servi sous /app. Un dossier par fonctionnalité dans front/src/features/
infra/   Docker Compose, Caddy
docs/    Cadrage, ADR, charte, format des leçons
```

## Commandes

```bash
# Base de données locale (port 5433)
cd infra && docker compose up -d db

# API — http://localhost:8010/api/docs (le proxy de Vite pointe sur 8010)
cd api && uv sync && uv run alembic upgrade head && uv run uvicorn app.main:app --reload --port 8010
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest

# Front (Node 22) — http://localhost:5173/app/ (la vitrine : http://localhost:5173/)
cd front && npm install && npm run dev
npm run lint && npm run typecheck && npm test
npm run test:e2e    # lance sa propre API sur une base renard_e2e : la base Docker doit tourner
```

Après un changement d'API, régénérer les types du front (la CI vérifie qu'ils sont à jour) :

```bash
cd api && uv run python -m app.openapi && cd ../front && npm run api:types
```

Charger les leçons de `docs/format-lecon/exemple.json` en base de dev : `cd api && uv run python -m app.lecons.commandes charger-exemple`.

Les parcours validés de `api/validated_courses/` sont créés et publiés au démarrage de l'API s'ils manquent en base (ADR 0025). À la main : `cd api && uv run python -m app.imports.parcours_valides`.

Comptes de test des tests de bout en bout : `admin@exemple.fr`, `relectrice@exemple.fr`, `contributeur@exemple.fr`, `apprenant@exemple.fr` et `partant@exemple.fr` (qui supprime son compte), mot de passe dans `api/app/dev.py`.

Nommer le premier admin (le compte doit exister) : `cd api && uv run python -m app.comptes.commandes promouvoir-admin <email>`.

Les durées de conservation (ADR 0014) s'appliquent chaque jour, au démarrage de l'API puis toutes les 24 h. À la main : `cd api && uv run python -m app.rgpd.purge`.

En attendant un service d'envoi, **l'email n'est pas vérifié** : on se connecte juste après l'inscription (ADR 0023). Avec `RENARD_VERIFICATION_EMAIL=true`, les liens de confirmation s'affichent dans les logs de l'API.

## Règles

**Langue**
- Docs, commentaires, messages d'interface et de commit : **en français**, courts et clairs.
- Vocabulaire métier en français et sans accent dans le code : `Lecon`, `Revision`, `Parcours`, `statut`. Les termes techniques standards restent en anglais : `router`, `session`, `config`.

**Qualité** (la CI bloque si un point échoue)
- Pas de code sans test. Back : pytest sur une vraie base PostgreSQL. Front : Vitest, plus Playwright pour l'accessibilité.
- Typage strict des deux côtés. Pas de `Any`, pas de `# type: ignore`, pas de `as unknown as`.
- Toute nouvelle page du front est ajoutée à `front/e2e/accessibilite.spec.ts` et au test axe de `front/src/routes.test.tsx`.
- Routes de l'API : `Lecture` pour lire, `Ecriture` pour modifier (vérifie le jeton CSRF), `exiger_role(...)` pour restreindre (voir `app/comptes/dependances.py`).
- Migration Alembic pour tout changement de schéma. Ne jamais modifier une migration déjà fusionnée.

**Accessibilité (RGAA)**
- Composants interactifs : React Aria. Pas de `div` cliquable.
- Couleurs : uniquement les jetons de `front/src/styles/tokens.css`. Aucune couleur en dur.
  La vitrine en garde une copie exacte dans `api/app/vitrine/statique/` (un test vérifie qu'elles sont identiques).
- Un `<title>` unique et un seul `h1` par page.

**Sécurité et RGPD**
- Les droits se vérifient **dans l'API**, jamais seulement dans l'interface.
- Markdown affiché sans HTML brut.
- Aucune ressource externe : ni CDN, ni police Google, ni traceur. Tout est hébergé chez nous (Pyodide compris, copié dans `front/public/pyodide/` à l'installation).
- CSP : toute modification passe par `front/csp.ts` **et** `infra/caddy/Caddyfile` (un test vérifie qu'ils sont identiques, ADR 0021).
- Aucune donnée personnelle de plus que ce que prévoit le cadrage.

**Git**
- Une branche et une pull request par fonctionnalité. Messages de commit : `type(portée): description` (`feat(comptes): connexion par email`).
- Ne jamais publier ni pousser sans demande explicite du porteur du projet.
