# 0021 — Isoler le code des leçons avec une CSP par worker

- **Statut** : Accepté
- **Date** : 2026-10-05
- **Complète** : [0009](0009-execution-code-navigateur.md)

## Contexte

Le code des leçons tourne dans le navigateur de l'apprenant, dans un Web Worker ([0009](0009-execution-code-navigateur.md)).
Ce code est écrit par des contributeurs ou des IA. Même relu, il pourrait appeler notre API avec la session de l'apprenant, ou envoyer des données ailleurs.
Un Web Worker n'a pas accès à la page, mais il peut faire des requêtes réseau.

## Décision

Chaque worker est servi avec **sa propre politique CSP**, plus stricte que celle de la page :

| Fichier | CSP | Effet |
|---|---|---|
| Page | `script-src 'self'`, rien d'externe | Aucun `eval`, aucune ressource tierce |
| Worker JavaScript | `default-src 'none'; script-src 'unsafe-eval'` | Peut exécuter du code, **aucun accès réseau** |
| Worker Python | `script-src` et `connect-src` limités à `/app/pyodide/`, plus `'wasm-unsafe-eval'` | Ne peut charger que Pyodide, **aucun accès à l'API** |

- Les règles sont écrites dans `front/csp.ts`. Le Caddyfile les recopie, et un test vérifie qu'elles sont identiques.
- `vite preview` applique les mêmes règles, donc les tests Playwright les éprouvent pour de vrai. Un test vérifie qu'un `fetch` vers l'API depuis une leçon échoue.
- Les workers ont des noms de fichier fixes (`worker-javascript-…`, `worker-python-…`) pour que Caddy les reconnaisse.

## Conséquences

- ✅ Une leçon malveillante ne peut ni lire les données de l'apprenant, ni agir en son nom, ni les envoyer ailleurs.
- ✅ La page elle-même n'autorise pas `eval` : seul le worker JavaScript le peut.
- ⚠️ Le code des leçons ne peut faire aucune requête réseau. C'est cohérent avec le guide de rédaction (« pas de réseau »).
- ⚠️ Deux copies des règles (TypeScript et Caddyfile), gardées identiques par un test.

## Alternatives écartées

- **`'unsafe-eval'` sur toute la page** : n'importe quelle faille XSS deviendrait bien plus grave.
- **iframe `sandbox`** : son CSP hérite de la page, et elle est plus lourde à faire communiquer qu'un worker.
