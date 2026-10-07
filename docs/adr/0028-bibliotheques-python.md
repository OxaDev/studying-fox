# 0028 — Bibliothèques Python hébergées et chargées à la demande

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Complète** : [0009](0009-execution-code-navigateur.md) et [0021](0021-isolation-du-code-des-lecons.md)

## Contexte

Les parcours sur SQLAlchemy, Alembic, FastAPI, Django et Django REST Framework ont besoin de ces bibliothèques dans Pyodide. Aujourd'hui, seuls le cœur de Pyodide et la bibliothèque standard sont hébergés, et la CSP du worker Python ne l'autorise à charger que ce qui est sous `/app/pyodide/` (ADR 0021).

- SQLAlchemy, FastAPI, Starlette, Pydantic et httpx existent en paquets Pyodide, dans la distribution officielle ; `sqlite3` est dans la bibliothèque standard.
- Django, Django REST Framework, Alembic (et Mako, asgiref, sqlparse) sont du Python pur, publié sur PyPI.

## Décision

**Héberger les paquets nécessaires sous `/app/pyodide/`, et les charger selon les imports du code.**

- **À l'installation** (`npm install`), le script `copier-pyodide.mjs` télécharge une liste de paquets **figée** dans le dépôt, avec leur empreinte SHA-256 : ceux de la distribution Pyodide (empreintes du `pyodide-lock.json`), et les roues PyPI en Python pur. Une empreinte différente arrête l'installation.
- Il écrit un `pyodide-lock.json` complété avec les paquets PyPI : Pyodide les charge alors comme les siens.
- **À l'exécution**, le worker appelle `loadPackagesFromImports` avant de lancer le code. Le message « Chargement de Python et de ses bibliothèques » ne s'affiche que si un paquet manque.
- **`await` est permis au niveau du module** : les leçons FastAPI appellent l'API avec httpx (`AsyncClient` et `ASGITransport`), en mémoire.
- **Django et DRF sont remis à neuf avant chaque exécution** (leurs modules sont retirés de `sys.modules`) : l'interpréteur est partagé par la page, et Django garde sinon sa configuration.
- **`DJANGO_ALLOW_ASYNC_UNSAFE` est activé** : dans Pyodide, la boucle asynchrone tourne toujours, et Django refuserait sinon d'accéder à la base. Sans threads, il n'y a pas d'accès concurrent.
- **Les versions** sont figées dans `front/scripts/paquets-python.lock.json`, écrit par `node scripts/copier-pyodide.mjs --verrouiller`. Le manifeste `paquets-python.json` dit quoi héberger.
- **Les outils `npm run python` et `npm run verifier`** exécutent le code avec Pyodide dans Node, avec les mêmes fichiers et le même lanceur que le navigateur.

## Conséquences

- ✅ Le code des leçons tourne tel quel, et sa sortie est vérifiée à l'import, comme pour la bibliothèque standard.
- ✅ Aucune ressource externe à l'exécution : la CSP et l'ADR 0014 ne changent pas.
- ✅ Chaque paquet ne se charge qu'au premier code qui l'importe.
- ⚠️ L'installation demande un accès au CDN de Pyodide et à PyPI, et le dossier `public/pyodide/` grossit (Django pèse environ 8 Mo).
- ⚠️ Pyodide n'a pas de threads : FastAPI exécute les routes et dépendances `def` dans un thread. Les leçons utilisent `async def` partout, et le disent.
- ⚠️ Pyodide n'a pas OpenSSL : `hashlib.pbkdf2_hmac`, qu'utilise Django pour les mots de passe, manque. Les leçons Django utilisent le hacheur MD5 (comme les tests de Django), et préviennent de ne jamais le faire en production.
- ⚠️ Les paquets sont chargés d'après les `import` du code : une application seulement citée dans `INSTALLED_APPS` n'est pas chargée. Les leçons l'importent explicitement.
- ⚠️ Mettre à jour une bibliothèque, c'est changer sa version et son empreinte dans la liste, puis relancer `npm run verifier` sur les parcours qui l'utilisent.

## Alternatives écartées

- **micropip depuis PyPI dans le navigateur** : ressource externe à l'exécution, contraire à l'ADR 0014 et à la CSP.
- **Exécuter le code de ces leçons sur le serveur** : écarté par l'ADR 0009.
- **Montrer le code sans l'exécuter** : contraire au guide de rédaction, et rien n'est vérifié à l'import.
