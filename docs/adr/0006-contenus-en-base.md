# 0006 — Contenus : Markdown stocké en base, avec versions

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Les leçons sont écrites par la communauté et par une IA, puis relues avant publication.
Il faut donc un éditeur intégré au site, un historique des versions, et un moyen de proposer une modification sans toucher à la version en ligne.

## Décision

- Le contenu d'une leçon est du **Markdown**, stocké **en base de données**.
- Chaque modification crée une nouvelle **révision**. On ne modifie jamais une révision existante.
- La leçon pointe vers sa **révision publiée**. Les apprenants voient cette révision, même si un brouillon plus récent existe.
- Les blocs de code exécutables utilisent la syntaxe Markdown habituelle, avec une option en plus :

  ````markdown
  ```python run
  print("Bonjour")
  ```
  ````

- Les images sont stockées sur le disque du serveur et servies par Caddy. Taille et formats sont limités.

## Conséquences

- ✅ Historique complet, retour en arrière possible, et comparaison entre deux versions.
- ✅ Le Markdown est simple pour les humains comme pour les IA.
- ⚠️ La base grossit avec les révisions. C'est négligeable pour du texte.
- ⚠️ Le Markdown doit être **nettoyé** avant affichage (pas de HTML brut) pour éviter les failles XSS.

## Alternatives écartées

- **Fichiers Markdown dans Git** : impossible de contribuer sans passer par Git, ce qui exclut les non-développeurs.
- **CMS externe** (Strapi, Directus) : une brique de plus à héberger, et un circuit de relecture difficile à adapter.
- **Éditeur visuel (WYSIWYG) en JSON** : plus lourd, et moins naturel pour une IA.
