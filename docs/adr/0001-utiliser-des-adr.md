# 0001 — Documenter les décisions avec des ADR

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Le projet est porté par une seule personne, et une grande partie du code sera écrite par des agents IA.
Sans trace écrite, on oublie pourquoi un choix a été fait. Les agents, eux, risquent de le défaire sans le savoir.

## Décision

Chaque décision technique importante fait l'objet d'un ADR court, en français, rangé dans `docs/adr/`.

## Conséquences

- ✅ Les agents IA lisent les ADR avant de coder et respectent les choix déjà faits.
- ✅ Un nouveau contributeur comprend le projet en quelques minutes.
- ⚠️ Il faut écrire un ADR à chaque nouvelle décision importante, sinon la liste devient obsolète.

## Alternatives écartées

- **Wiki externe** : il vit à part du code et finit par ne plus correspondre à la réalité.
- **Rien du tout** : les mêmes questions se reposent sans cesse.
