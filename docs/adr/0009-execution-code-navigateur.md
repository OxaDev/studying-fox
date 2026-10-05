# 0009 — Exécution du code dans le navigateur

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Les leçons contiennent du code que l'apprenant peut lancer et modifier.
Exécuter du code inconnu sur notre serveur est risqué (piratage, abus) et coûteux.

## Décision

Le code s'exécute **uniquement dans le navigateur de l'apprenant**, dans un **Web Worker** isolé de la page.

| Langage | Moteur |
|---|---|
| JavaScript | le moteur du navigateur, dans un Worker |
| Python | **Pyodide** (Python compilé en WebAssembly), dans un Worker |

- Un **délai maximum** (10 s par défaut) arrête le code qui tourne en boucle.
- La sortie (print, erreurs) s'affiche sous l'éditeur et est annoncée aux lecteurs d'écran.

## Conséquences

- ✅ Aucun risque pour le serveur, et aucun coût d'exécution.
- ✅ Fonctionne même si l'API est lente.
- ⚠️ Pyodide pèse environ 10 Mo. On le charge seulement au premier clic sur « Exécuter », puis le navigateur le garde en cache.
- ⚠️ Langages limités à ceux qui tournent en WebAssembly. Pas de C, Java ou Rust compilés en V1.

## Alternatives écartées

- **Exécution sur le serveur** (Judge0, conteneurs jetables) : risques de sécurité, coût, et beaucoup de maintenance.
- **Service tiers** (Replit, CodeSandbox) : dépendance externe, et code envoyé hors UE.
