# Le Renard Étudiant

Plateforme **gratuite** pour apprendre la programmation à son rythme, avec un renard bleu pour compagnon.
Des leçons courtes, du code à lancer directement dans le navigateur, et des parcours qui guident pas à pas.

## Démarrer

Prérequis : Docker, [uv](https://docs.astral.sh/uv/), Node 22.

L'API et le front tournent en même temps : ouvre **un terminal pour chacun**.

```bash
# 1. Base de données (une fois)
cd infra && docker compose up -d db

# 2. API, dans un premier terminal — http://localhost:8010/api/docs
cd api && uv sync && uv run alembic upgrade head && uv run uvicorn app.main:app --reload --port 8010

# 3. Front, dans un second terminal — http://localhost:5173/app/
cd front && npm install && npm run dev
```

« Le serveur ne répond pas » dans l'application : l'API n'est pas lancée, ou un autre programme occupe le port 8010.

La vitrine publique s'ouvre sur http://localhost:5173/, l'application sur http://localhost:5173/app/.

## Documentation

- [Cadrage](docs/cadrage.md) : ce qu'on construit, et pour qui
- [Décisions d'architecture](docs/adr/README.md)
- [Feuille de route](docs/feuille-de-route.md)
- [Identité visuelle](docs/identite-visuelle.md)
- [Format des leçons à importer](docs/format-lecon/README.md)

## Licences

- Code : [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.fr.html)
- Contenus des leçons : [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr)
