# 0016 — Pages publiques pour le référencement

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Les comptes sont obligatoires, donc les moteurs de recherche ne voient aucun contenu et le site est invisible.
Le front est une SPA ([0002](0002-architecture-globale.md)) : son contenu est mal lu par les moteurs de recherche et par les aperçus de liens (réseaux sociaux, messageries).

## Décision

Une **vitrine publique**, sans connexion, montre ce qu'on va apprendre, mais pas les leçons elles-mêmes :

| Page | Contenu visible |
|---|---|
| Accueil | Présentation du site, parcours mis en avant |
| Catalogue | Liste des parcours publiés, avec leur thème et leur niveau |
| Présentation d'un parcours | Titre, description, niveau, **titres** des leçons, bouton « Commencer » qui mène à l'inscription |
| Pages légales | Mentions légales, CGU, confidentialité, accessibilité |

Ces pages sont **générées côté serveur par FastAPI** (gabarits Jinja), en HTML simple et accessible, sans JavaScript obligatoire.
FastAPI fournit aussi `sitemap.xml`, `robots.txt` et les balises d'aperçu (Open Graph).
Tout le reste (leçons, progression, contribution, administration) reste dans la SPA React, derrière la connexion.

## Conséquences

- ✅ Le site est trouvable sur Google, et les liens partagés ont un aperçu.
- ✅ Ces pages sont très rapides et faciles à rendre accessibles.
- ⚠️ La charte graphique existe en deux endroits (Jinja et React). On partage une feuille de style commune pour les couleurs et la typographie.
- ⚠️ Cela nuance l'ADR 0002 : FastAPI sert aussi quelques pages HTML, uniquement pour la vitrine.

## Alternatives écartées

- **Rendu côté serveur de React** (Next.js, React Router en mode framework) : il faut un serveur Node en plus de Python, ce qui est trop lourd pour quelques pages.
- **Compter sur Google pour exécuter le JavaScript** : indexation lente et incertaine, et aucun aperçu sur les réseaux sociaux.
- **Pré-générer les pages à chaque build** : les parcours sont en base et changent sans nouveau déploiement.
