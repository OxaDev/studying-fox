# 0024 — Choix du thème, retenu dans le navigateur

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Précise** : [0014](0014-rgpd.md). Une préférence d'affichage s'ajoute au cookie de session.

## Contexte

Le site a un thème clair et un thème sombre. Jusqu'ici, il suivait seulement le réglage de l'appareil (`prefers-color-scheme`). Certaines personnes veulent un thème différent de celui de leur appareil : lisibilité, fatigue visuelle. L'ADR 0014 dit que seul le cookie de session existe.

## Décision

Le profil propose trois choix : **Comme mon appareil** (par défaut), **Clair**, **Sombre**.
Le choix est gardé dans le `localStorage` du navigateur (clé `renard-theme`), jamais envoyé au serveur. L'application le lit au démarrage et pose `data-theme` sur `<html>`, que `tokens.css` sait déjà lire.

## Conséquences

- ✅ Aucune donnée de plus en base, rien dans l'export ni dans le registre des traitements.
- ✅ Pas de consentement à demander : c'est un réglage demandé par la personne, pas un traceur (exemption prévue par la CNIL).
- ⚠️ Le choix vaut pour un navigateur : il faut le refaire sur un autre appareil.
- ⚠️ La vitrine, sans JavaScript, suit toujours le réglage de l'appareil.
- ⚠️ Le thème est appliqué par le script de l'application. Un court instant avant, la page peut s'afficher avec le thème de l'appareil.

## Alternatives écartées

- **Préférence enregistrée dans le compte** : une donnée personnelle de plus, une migration, et le thème ne s'appliquerait qu'après la connexion.
- **Cookie** : il partirait vers le serveur à chaque requête, sans utilité.
- **Script dans `<head>` pour appliquer le thème avant tout affichage** : il faudrait assouplir la CSP (`script-src`) pour un gain minime.
