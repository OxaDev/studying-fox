# 0013 — Accessibilité : RGAA dès le départ

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Le porteur du projet veut respecter toutes les obligations dès le départ.
Corriger l'accessibilité après coup coûte beaucoup plus cher que de l'intégrer dès le début.

## Décision

On vise le **RGAA 4.1**, qui reprend le **WCAG 2.1 niveau AA**.

Règles concrètes :

- tout le site s'utilise **au clavier**, avec un focus toujours visible ;
- contraste d'au moins **4,5:1** pour le texte ;
- images avec un texte alternatif, **obligatoire** dans l'éditeur de leçons ;
- titres hiérarchisés, avec des balises HTML qui ont du sens ;
- sorties du code annoncées aux lecteurs d'écran (`aria-live`) ;
- le site reste lisible avec le texte agrandi à 200 %.

Vérifications :

- **axe-core** dans les tests (Vitest et Playwright). Le build échoue en cas d'erreur ;
- tests manuels avec un lecteur d'écran (NVDA ou VoiceOver) avant chaque version importante ;
- **déclaration d'accessibilité** publiée sur le site.

## Conséquences

- ✅ Le site est utilisable par tous, et conforme dès le lancement.
- ⚠️ Chaque composant demande un peu plus de travail. React Aria en absorbe une bonne partie (voir [0003](0003-front-react-vite.md)).
- ⚠️ Les tests automatiques détectent environ 30 % des problèmes seulement. Les tests manuels restent indispensables.
