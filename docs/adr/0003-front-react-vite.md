# 0003 — Front : React + TypeScript + Vite

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Le front doit être accessible (RGAA), maintenable par des agents IA, et intégrer un éditeur de code.

## Décision

| Besoin | Outil |
|---|---|
| Langage | **TypeScript** en mode strict |
| Build | **Vite** |
| Navigation | **React Router** |
| Appels API | **TanStack Query** + client généré depuis le schéma OpenAPI |
| Composants accessibles | **React Aria** (Adobe) |
| Styles | **CSS Modules** |
| Éditeur de code | **CodeMirror 6** |
| Affichage Markdown | **react-markdown** |

## Conséquences

- ✅ Le typage strict et le client généré limitent les erreurs, notamment celles des agents IA.
- ✅ React Aria gère le clavier, le focus et les attributs ARIA, ce qui fait gagner beaucoup de temps sur le RGAA.
- ✅ CodeMirror 6 est léger et accessible au clavier.
- ⚠️ CSS Modules demande de construire soi-même un petit système de design (couleurs, espacements).

## Alternatives écartées

- **Monaco** (l'éditeur de VS Code) : trop lourd, et peu adapté aux mobiles.
- **Tailwind** : possible, mais il est plus difficile de garantir des contrastes cohérents sans système de design.
- **MUI** : visuel imposé et bundle lourd.
