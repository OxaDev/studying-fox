# 0004 — Back : FastAPI + SQLAlchemy + Alembic

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Le porteur du projet a choisi Python et FastAPI. Il reste à choisir les outils qui les accompagnent.

## Décision

| Besoin | Outil |
|---|---|
| Framework | **FastAPI** |
| Validation | **Pydantic v2** |
| Accès base de données | **SQLAlchemy 2** (asynchrone) |
| Évolutions du schéma | **Alembic** |
| Gestion des dépendances | **uv** |
| Tests | **pytest** + une vraie base PostgreSQL de test |
| Lint et typage | **Ruff** + **mypy** en mode strict |

Le code est organisé **par domaine**, et non par type de fichier :
`comptes/`, `lecons/`, `parcours/`, `progression/`, `relecture/`, `admin/`.

## Conséquences

- ✅ La documentation OpenAPI est générée automatiquement, et le front s'en sert.
- ✅ Le découpage par domaine aide les agents IA à travailler sur une zone sans casser le reste.
- ⚠️ SQLAlchemy en mode asynchrone demande de la rigueur sur les sessions. Le pattern doit être documenté dès le premier module.

## Alternatives écartées

- **SQLModel** : moins mature, et la documentation de ses cas avancés est fragile.
- **Django** : trop complet, et en doublon avec le choix de FastAPI.
