# 0015 — Monorepo et garde-fous qualité pour les agents IA

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Le code est écrit en grande partie par des agents IA, sous la supervision d'une seule personne.
Il faut que les erreurs soient détectées **automatiquement**, avant même la relecture humaine.

## Décision

**Un seul dépôt** :

```
apprends-moi/
├── front/          # React (ADR 0003)
├── api/            # FastAPI (ADR 0004)
├── infra/          # Docker Compose, Caddy, scripts de sauvegarde
├── docs/           # Cadrage + ADR
└── CLAUDE.md       # Règles pour les agents IA
```

**Garde-fous** (en CI, à chaque commit, et bloquants) :

| Contrôle | Front | Back |
|---|---|---|
| Lint et formatage | ESLint + Prettier | Ruff |
| Typage | `tsc --strict` | mypy strict |
| Tests unitaires | Vitest | pytest |
| Tests de bout en bout | Playwright + axe | — |
| Contrat d'API | client régénéré depuis OpenAPI, sans écart | — |

**Règles pour les agents** (dans `CLAUDE.md`) :

- lire les ADR avant toute modification d'architecture ;
- pas de code sans test ;
- un changement = une branche = une pull request relue par l'humain.

## Conséquences

- ✅ Un seul endroit pour tout, et le front et le back évoluent ensemble.
- ✅ Les erreurs des agents sont bloquées par la CI.
- ⚠️ La CI doit rester rapide (moins de 10 min), sinon elle ralentit tout le monde.

## Alternatives écartées

- **Deux dépôts séparés** : le contrat d'API se désynchronise, et les agents s'y retrouvent moins bien.
