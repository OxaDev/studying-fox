# Feuille de route

On avance par **jalons**. Chaque jalon est livrable et testé avant de passer au suivant.
Un jalon est découpé en petites pull requests, une par fonctionnalité.

| # | Jalon | Contenu | Terminé quand… | ADR |
|---|---|---|---|---|
| 0 | **Squelette** ✅ | Dépôt, API minimale, front minimal, Docker, CI | La CI passe au vert | 0015, 0020 |
| 1 | **Comptes** ✅ | Inscription, confirmation (coupée en attendant le service d'envoi, ADR 0023), connexion, déconnexion, profil, rôles | On crée un compte et on se connecte dans l'appli | 0008 |
| 2 | **Leçons** ✅ | Modèles leçon et révision, affichage d'une leçon, rendu Markdown nettoyé, blocs de code exécutables (JS puis Python) | Un apprenant lit une leçon et lance son code | 0006, 0009 |
| 3 | **Parcours et progression** ✅ | Parcours, sommaire, « leçon terminée », avancement, Mon espace | L'écran « Mon espace » des maquettes fonctionne | — |
| 4 | **Import et relecture** ✅ | Import JSON avec aperçu et vérification du code, file de relecture, publication, historique | Le fichier `exemple.json` est importé, relu et publié | 0010, 0019 |
| 5 | **Contribution** ✅ | Éditeur Markdown avec aperçu, brouillons, soumission | Un contributeur propose une leçon depuis le site | 0006, 0010 |
| 6 | **Recherche** ✅ | Index plein texte, page de recherche, filtres | « fonctions » trouve la leçon « fonction » | 0007 |
| 7 | **Vitrine publique** ✅ | Accueil, catalogue, présentation d'un parcours, sitemap | Les pages publiques sont lisibles sans connexion ni JavaScript | 0016 |
| 8 | **Administration et RGPD** ✅ | Écrans de gestion des utilisateurs (l’API existe déjà) et des thèmes, journal des actions, export et suppression du compte, purge des comptes non confirmés après 30 jours | Un utilisateur télécharge ses données et supprime son compte | 0014 |
| 9 | **Mise en ligne** | VPS, sauvegardes, supervision, mentions légales, CGU, déclaration d'accessibilité, audit manuel au lecteur d'écran | Le site est en ligne et conforme | 0012, 0013 |

**Nouveaux langages**, en parallèle des jalons : VBA sur un classeur Excel simulé (ADR 0026), puis Java, puis Go.

**Bloquants à lever avant le jalon 9** : nom de domaine, service d'envoi d'emails. Avec ce service, activer la vérification de l'email en suivant l'ADR 0023 (migration des comptes existants).
