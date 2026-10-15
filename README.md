# Le Renard Étudiant

Plateforme **gratuite** pour apprendre la programmation à son rythme, avec un renard bleu pour compagnon.
Des leçons courtes, du code à lancer directement dans le navigateur, et des parcours qui guident pas à pas.

## Démarrer

Prérequis : Docker, [uv](https://docs.astral.sh/uv/), Node 26.

L'API et le front tournent en même temps : ouvre **un terminal pour chacun**.

```bash
# 1. Base de données (une fois)
cd infra
docker compose up -d db

# 2. API, dans un premier terminal — http://localhost:8010/api/docs
cd api
python -m venv .venv
source .venv/bin/activate
pip install uv
uv sync --frozen
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --port 8010

# 3. Front, dans un second terminal — http://localhost:5173/app/
cd front
npm install && npm run dev
```

« Le serveur ne répond pas » dans l'application : l'API n'est pas lancée, ou un autre programme occupe le port 8010.

La vitrine publique s'ouvre sur http://localhost:5173/, l'application sur http://localhost:5173/app/.

## Déployer sur un serveur

Prérequis : Docker et Docker Compose 2.24 ou plus, `make`, `git`. Rien d'autre : les images construisent l'API et le front.
Par défaut, le site est servi sous `https://domain.com/studying-fox`, derrière le nginx de la machine ([ADR 0031](docs/adr/0031-site-sous-un-chemin.md)).

```bash
git clone <dépôt> && cd studying-fox
make configurer      # crée infra/.env : y régler DOMAINE, CHEMIN_BASE et PORT_HTTP
make deployer        # construit les images, démarre la base, l'API et Caddy
make nginx           # affiche le bloc « location » à ajouter au nginx du domaine
sudo nginx -t && sudo systemctl reload nginx
make admin EMAIL=moi@exemple.fr   # après avoir créé son compte sur le site
```

Ensuite : `make mettre-a-jour` pour déployer la dernière version, `make sauvegarder` pour copier la base et les images dans `sauvegardes/`. `make` liste toutes les commandes.

Sans nginx, Caddy peut gérer seul le HTTPS : dans `infra/.env`, garder seulement `COMPOSE_FILE=docker-compose.yml` et vider `CHEMIN_BASE`.

## Promouvoir un admin

```bash
# Dans un terminal
cd api/
source .venv/bin/activate
python -m app.comptes.commandes promouvoir-admin <email>
```

## Documentation

- [Cadrage](docs/cadrage.md) : ce qu'on construit, et pour qui
- [Décisions d'architecture](docs/adr/README.md)
- [Feuille de route](docs/feuille-de-route.md)
- [Identité visuelle](docs/identite-visuelle.md)
- [Format des leçons à importer](docs/format-lecon/README.md)

## Licences

- Code : [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.fr.html)
- Contenus des leçons : [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr)
