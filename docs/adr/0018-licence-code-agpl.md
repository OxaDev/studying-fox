# 0018 — Licence du code : AGPL-3.0

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Le code de la plateforme sera public. Les contenus sont sous CC BY-SA ([0017](0017-licence-contenus-cc-by-sa.md)) : libres, avec obligation de partager à l'identique.
On veut que la plateforme reste libre elle aussi.

## Décision

Le code est publié sous **[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.fr.html)**.

Concrètement, chacun peut utiliser, modifier et héberger Le Renard Étudiant. Mais **s'il le met en ligne avec des modifications, il doit publier ces modifications** sous la même licence.

## Conséquences

- ✅ Même logique que les contenus : ce qui est libre reste libre.
- ✅ Une entreprise ne peut pas reprendre le code, l'améliorer en privé et proposer un service fermé.
- ⚠️ Certaines entreprises interdisent l'AGPL en interne. Cela peut réduire les contributions venant d'elles.
- ⚠️ Toutes les dépendances doivent être compatibles avec l'AGPL. MIT, BSD, Apache-2.0 et LGPL le sont toutes : React, FastAPI, Pyodide et CodeMirror ne posent pas de problème.

## Alternatives écartées

- **MIT** : la plus simple et la plus permissive, mais elle autorise une reprise fermée du code.
- **GPL-3.0** : elle ne s'applique pas à un logiciel utilisé en ligne sans être distribué. C'est précisément le cas d'une plateforme web.
