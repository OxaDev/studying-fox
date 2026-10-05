# 0012 — Hébergement : VPS en UE + Docker Compose

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Le porteur du projet veut un serveur à lui. Le RGPD impose de garder les données en UE.

## Décision

- Un **VPS** chez un hébergeur européen (OVH, Scaleway, Hetzner…).
- Tous les services tournent avec **Docker Compose** :
  - **Caddy** : reverse proxy, HTTPS automatique, sert le front et les images ;
  - **api** : FastAPI ;
  - **db** : PostgreSQL.
- **Sauvegardes** : un dump PostgreSQL et une copie des images chaque jour, envoyés vers un stockage externe en UE, conservés 30 jours. Une restauration est testée chaque mois.
- **Déploiement** : la CI construit les images Docker et les publie. Le serveur les récupère et redémarre les services.

## Conséquences

- ✅ Coût faible et maîtrisé, données en UE.
- ✅ On peut reproduire la production en local avec la même commande.
- ⚠️ Mises à jour du système, sécurité et surveillance sont à notre charge. Il faut un minimum de supervision (disponibilité et espace disque).

## Alternatives écartées

- **Vercel / Netlify + base gérée** : ce n'est pas le choix du porteur, et les données sont souvent hébergées hors UE.
- **Kubernetes** : bien trop complexe pour un seul serveur.
