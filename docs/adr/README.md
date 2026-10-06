# Décisions d'architecture (ADR)

Un ADR, c'est une fiche courte qui répond à trois questions :
**quel était le problème ? Qu'a-t-on décidé ? Qu'est-ce que ça implique ?**

## Statuts

- **Accepté** : la décision est prise et s'applique.
- **Proposé** : la décision est à valider par le porteur du projet.
- **Remplacé** : la décision a été remplacée par un ADR plus récent, dont le lien figure dans la fiche.

## Liste

| N° | Décision | Statut |
|---|---|---|
| [0001](0001-utiliser-des-adr.md) | Documenter les décisions avec des ADR | Accepté |
| [0002](0002-architecture-globale.md) | Architecture : un front React séparé d'une API | Accepté |
| [0003](0003-front-react-vite.md) | Front : React + TypeScript + Vite | Accepté |
| [0004](0004-back-fastapi.md) | Back : FastAPI + SQLAlchemy + Alembic | Accepté |
| [0005](0005-base-postgresql.md) | Base de données : PostgreSQL | Accepté |
| [0006](0006-contenus-en-base.md) | Contenus : Markdown stocké en base, avec versions | Accepté |
| [0007](0007-recherche-postgresql.md) | Recherche : plein texte de PostgreSQL | Accepté |
| [0008](0008-authentification.md) | Authentification : session dans un cookie sécurisé | Accepté |
| [0009](0009-execution-code-navigateur.md) | Exécution du code dans le navigateur | Accepté |
| [0010](0010-circuit-de-relecture.md) | Circuit de relecture et rôles | Accepté |
| [0011](0011-contenus-generes-par-ia.md) | ~~Contenus générés par IA~~ | Remplacé par 0019 |
| [0012](0012-hebergement-vps-docker.md) | Hébergement : VPS en UE + Docker Compose | Accepté |
| [0013](0013-accessibilite-rgaa.md) | Accessibilité : RGAA dès le départ | Accepté |
| [0014](0014-rgpd.md) | RGPD : collecter le minimum, aucun traceur | Accepté |
| [0015](0015-monorepo-et-qualite.md) | Monorepo et garde-fous qualité pour les agents IA | Accepté |
| [0016](0016-pages-publiques-referencement.md) | Pages publiques pour le référencement | Accepté |
| [0017](0017-licence-contenus-cc-by-sa.md) | Licence des contenus : CC BY-SA 4.0 | Accepté |
| [0018](0018-licence-code-agpl.md) | Licence du code : AGPL-3.0 | Accepté |
| [0019](0019-import-lecons-json.md) | Import de leçons au format JSON | Accepté |
| [0020](0020-decoupage-des-adresses.md) | Découpage des adresses du site | Accepté |
| [0021](0021-isolation-du-code-des-lecons.md) | Isoler le code des leçons avec une CSP par worker | Accepté |
| [0022](0022-brouillon-modifiable.md) | Un brouillon reste modifiable jusqu'à sa soumission | Accepté |
| [0023](0023-inscription-sans-verification-email.md) | Inscription sans vérification de l'email, en attendant un service d'envoi | Accepté |
| [0024](0024-choix-du-theme.md) | Choix du thème, retenu dans le navigateur | Accepté |
| [0025](0025-parcours-valides.md) | Parcours validés dans le dépôt, identifiés par un UUID | Accepté |
| [0026](0026-interpreteur-vba.md) | VBA : un interpréteur maison et un classeur Excel simulé | Accepté |
| [0027](0027-formules-excel.md) | Formules Excel : un mini-moteur de calcul maison | Accepté |

## Écrire un nouvel ADR

1. Copier [modele.md](modele.md) sous le nom `NNNN-titre-court.md`.
2. Le remplir en restant court : une page maximum.
3. L'ajouter au tableau ci-dessus.
4. Ne jamais modifier un ADR accepté. Si la décision change, en écrire un nouveau qui le remplace.
