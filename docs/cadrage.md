# Le Renard Étudiant — Document de cadrage

> Version 0.4 · 5 octobre 2026 · Statut : validé

## 1. Vision

**Le Renard Étudiant** (nom de code du dépôt : `apprends-moi`) est une plateforme web **gratuite** pour apprendre la **programmation** à son rythme.
On y trouve des leçons courtes, des exemples de code qu'on peut lancer directement, et des parcours qui guident pas à pas.

Les contenus sont écrits par la communauté ou produits par des agents IA sous forme de fichiers à importer. Ils sont **toujours relus par un humain** avant d'être publiés.

## 2. Public

| Qui | Ce qu'il cherche |
|---|---|
| Professionnels (reconversion, montée en compétence) | Apprendre vite des notions concrètes, utiles au travail |

- Langue : **français uniquement**.
- Niveau de départ : débutant à intermédiaire.
- Le nom « Le Renard Étudiant » désigne la mascotte, qui apprend aux côtés de l'utilisateur. L'utilisateur, lui, reste un professionnel : le ton est encourageant, mais jamais scolaire.

## 3. Périmètre

### Dans la V1

- Leçons en texte et images, avec des **blocs de code exécutables**.
- **Parcours** : une suite ordonnée de leçons. Une leçon peut aussi se lire seule.
- **Comptes obligatoires** pour accéder aux leçons.
- **Vitrine publique**, sans connexion : accueil, catalogue des parcours, présentation de chaque parcours. Elle sert au référencement.
- **Suivi de progression** : leçons terminées, avancement dans un parcours.
- **Recherche** dans les leçons et les parcours.
- **Contribution** : proposer une leçon, la faire relire, la publier.
- **Import de leçons** depuis un fichier JSON écrit par un agent IA. Les leçons importées deviennent des brouillons qui suivent le même circuit de relecture.
- **Interface d'administration** : contenus, utilisateurs, rôles, modération.

### Hors V1

- Vidéos.
- Quiz et exercices notés.
- Commentaires et forum.
- Badges et certificats.
- Mode hors-ligne.
- Autres langues que le français.
- Application mobile (le site reste utilisable sur mobile).

## 4. Rôles

| Rôle | Peut… |
|---|---|
| **Apprenant** | Lire les leçons, lancer le code, suivre sa progression |
| **Contributeur** | Tout ce que fait l'apprenant, plus créer et modifier ses brouillons et les soumettre à relecture |
| **Relecteur** | Tout ce que fait le contributeur, plus valider, refuser, demander des corrections et **importer des leçons** |
| **Admin** | Tout, y compris gérer les utilisateurs, les rôles et les parcours |

Les agents IA n'ont **pas de compte** : ils produisent des fichiers qu'un humain importe.

À l'inscription, tout le monde est apprenant. Les rôles supérieurs sont attribués par un admin.

## 5. Besoins fonctionnels

### 5.1 Compte et accès

- S'inscrire avec un email et un mot de passe, puis confirmer son email. En attendant un service d'envoi, l'email est obligatoire mais pas vérifié ([ADR 0023](adr/0023-inscription-sans-verification-email.md)).
- Se connecter et se déconnecter. Réinitialiser son mot de passe.
- Modifier son profil : pseudo, email, mot de passe.
- **Télécharger ses données** et **supprimer son compte** (obligations RGPD).

### 5.2 Apprendre

- Parcourir le catalogue par thème, par niveau ou par parcours.
- Lire une leçon : texte, images, extraits de code.
- **Lancer le code** d'un exemple, le modifier et le relancer.
- Revenir à la version d'origine d'un exemple.
- Passer à la leçon suivante dans un parcours.

### 5.3 Progression

- Marquer une leçon comme terminée.
- Voir son avancement dans chaque parcours, en pourcentage.
- Reprendre là où on s'était arrêté.
- Tableau de bord personnel : parcours en cours et parcours terminés.

### 5.4 Recherche

- Chercher par mots-clés dans les titres, les résumés et le contenu.
- Filtrer par thème, par niveau et par type (leçon ou parcours).
- La recherche est tolérante au français : elle trouve « fonction » quand on tape « fonctions ».

### 5.5 Contribution

- Rédiger une leçon dans un éditeur Markdown avec un aperçu en direct.
- Insérer des blocs de code exécutables en indiquant leur langage.
- Enregistrer un brouillon, puis le soumettre à relecture.
- Garder un historique des versions de chaque leçon.
- Proposer une modification d'une leçon déjà publiée.

### 5.6 Relecture et publication

- Une file des contenus à relire.
- Trois décisions possibles : **publier**, **demander des corrections** (avec un commentaire) ou **refuser**.
- Un contenu ne peut pas être publié par la personne qui l'a écrit. Exception : un contenu **importé** peut être publié par la personne qui l'a importé, puisqu'elle n'en est pas l'autrice.
- Un contenu produit par une IA est marqué « rédigé avec l'aide d'une IA ».

### 5.7 Import de leçons

- Un agent IA, ou toute autre personne, écrit des leçons en suivant le [format d'import](format-lecon/README.md) (JSON Schema, exemple, guide de rédaction).
- Un relecteur ou un admin dépose le fichier `.json` ou `.zip` dans l'administration.
- La plateforme vérifie le fichier et exécute les exemples de code, puis affiche un aperçu. C'est tout ou rien.
- Chaque leçon devient un brouillon, ou une nouvelle version si la leçon existe déjà. Un parcours peut être créé dans la foulée.
- La personne qui importe relit, puis publie.

### 5.8 Administration

- Gérer les utilisateurs : liste, rôles, suspension.
- Gérer les parcours : création, ordre des leçons.
- Gérer les thèmes et les niveaux.
- Consulter le journal des actions sensibles : publications, changements de rôle, suppressions.

## 6. Besoins non fonctionnels

| Sujet | Exigence |
|---|---|
| **Accessibilité** | RGAA 4.1, ce qui couvre WCAG 2.1 niveau AA. Déclaration d'accessibilité publiée. |
| **RGPD** | Données minimales, hébergement en UE, aucun traceur tiers, export et suppression du compte. |
| **Sécurité** | Mots de passe hachés (Argon2), HTTPS partout, protection CSRF, limitation des tentatives de connexion, code utilisateur exécuté hors du serveur. |
| **Performance** | Page de leçon affichée en moins de 2 s sur une connexion 4G. |
| **Responsive** | Utilisable du mobile au grand écran. |
| **Qualité** | Tests automatisés obligatoires et contrôlés à chaque commit, car le code est écrit en grande partie par des agents IA. |
| **Mentions légales** | Mentions légales, CGU, politique de confidentialité, déclaration d'accessibilité. |
| **Licence des contenus** | CC BY-SA 4.0. Le contributeur l'accepte avant sa première soumission. |
| **Référencement** | Pages vitrine en HTML généré côté serveur, `sitemap.xml`, aperçus de liens (Open Graph). |
| **Identité visuelle** | Ambiance kawaï japonaise, dominante bleue, mascotte : un renard bleu. Voir [identite-visuelle.md](identite-visuelle.md) et la [planche de maquettes](maquettes/planche-da-v1.png). |

## 7. Architecture en bref

```
Navigateur ──HTTPS──▶ Caddy (reverse proxy)
                        ├──▶ Front React (fichiers statiques)
                        └──▶ FastAPI ──▶ PostgreSQL
                              ├─ /api : API REST
                              └─ pages vitrine publiques (HTML)
Code des leçons : exécuté dans le navigateur (Web Worker / Pyodide)
Agent IA ──fichier JSON──▶ humain ──import──▶ brouillons ──relecture──▶ publiées
```

| Brique | Choix | ADR |
|---|---|---|
| Front | React + TypeScript + Vite | [0003](adr/0003-front-react-vite.md) |
| Back | Python + FastAPI | [0004](adr/0004-back-fastapi.md) |
| Base de données | PostgreSQL | [0005](adr/0005-base-postgresql.md) |
| Contenus | Markdown stocké en base, avec versions | [0006](adr/0006-contenus-en-base.md) |
| Recherche | Recherche plein texte de PostgreSQL | [0007](adr/0007-recherche-postgresql.md) |
| Authentification | Session dans un cookie sécurisé | [0008](adr/0008-authentification.md) |
| Exécution de code | Dans le navigateur | [0009](adr/0009-execution-code-navigateur.md) |
| Hébergement | VPS en UE + Docker Compose | [0012](adr/0012-hebergement-vps-docker.md) |
| Vitrine publique | Pages HTML générées par FastAPI | [0016](adr/0016-pages-publiques-referencement.md) |
| Licence des contenus | CC BY-SA 4.0 | [0017](adr/0017-licence-contenus-cc-by-sa.md) |
| Licence du code | AGPL-3.0 | [0018](adr/0018-licence-code-agpl.md) |
| Contenus produits par IA | Import de fichiers JSON | [0019](adr/0019-import-lecons-json.md) |

La liste complète est dans [adr/README.md](adr/README.md).

## 8. Modèle de données (simplifié)

| Entité | Champs principaux |
|---|---|
| `User` | id, email, pseudo, mot_de_passe_hash, rôle, email_vérifié, licence_acceptée_le, créé_le |
| `Theme` | id, nom, slug |
| `Lesson` | id, slug, thème, niveau, auteur, statut, version_publiée |
| `LessonRevision` | id, leçon, n° de version, titre, résumé, objectifs, durée, contenu_markdown, auteur, import (si importée), assisté_par_ia, créé_le |
| `Review` | id, révision, relecteur, décision, commentaire, créé_le |
| `Path` (parcours) | id, titre, description, niveau, publié |
| `PathLesson` | parcours, leçon, position |
| `Progress` | utilisateur, leçon, terminé_le |
| `Import` | id, importateur, nom_fichier, nb_leçons, assisté_par_ia, outil, créé_le |
| `AuditLog` | id, acteur, action, cible, créé_le |

Statuts d'une leçon : `brouillon` → `en_relecture` → `publiée`, ou `à_corriger` / `refusée`.

## 9. Organisation du projet

- **Développement** : une seule personne humaine, qui pilote des **agents IA** chargés du code et de l'enrichissement des cours.
- **Code** : public, publié par le porteur du projet.
- **Délais** : pas de date imposée. On avance par jalons livrables (voir la [feuille de route](feuille-de-route.md)).
- **Budget** : non défini pour l'instant. On privilégie les solutions sobres.

## 10. Questions ouvertes

1. **Envoi d'emails** (confirmation, mot de passe oublié) : reporté.
2. **Nom de domaine** : à choisir, en lien avec le nom « Le Renard Étudiant ».

Questions tranchées :

- Langages exécutables : Python et JavaScript seulement.
- Référencement : une vitrine publique ([ADR 0016](adr/0016-pages-publiques-referencement.md)).
- Licence des contenus : CC BY-SA 4.0 ([ADR 0017](adr/0017-licence-contenus-cc-by-sa.md)).
- Contenus IA : fichiers JSON importés, l'IA est gérée par le porteur du projet ([ADR 0019](adr/0019-import-lecons-json.md)).
- Licence du code : AGPL-3.0 ([ADR 0018](adr/0018-licence-code-agpl.md)).
- Publication d'un import : la personne qui importe peut publier ([ADR 0019](adr/0019-import-lecons-json.md)).
- Public : des professionnels. Le nom désigne la mascotte : **c'est le renard qui est étudiant**, pas l'utilisateur.
- Nom et identité visuelle : « Le Renard Étudiant », kawaï, dominante bleue, renard bleu ([identite-visuelle.md](identite-visuelle.md)).

## 11. Glossaire

- **Leçon** : un contenu court sur une seule notion.
- **Parcours** : une suite ordonnée de leçons pour atteindre un objectif.
- **Révision** : une version d'une leçon. Chaque modification crée une nouvelle révision.
- **ADR** (Architecture Decision Record) : une fiche qui explique une décision technique et ses raisons.
- **Paquet** : un fichier JSON (ou ZIP) qui contient des leçons à importer.
- **Slug** : l'identifiant lisible d'une leçon ou d'un parcours, utilisé dans les adresses web. Ex : `les-variables-en-python`.
