# 0008 — Authentification : session dans un cookie sécurisé

- **Statut** : Accepté. La partie « Agent IA » est remplacée par [0019](0019-import-lecons-json.md). La confirmation de l'email est un réglage, coupé pour l'instant ([0023](0023-inscription-sans-verification-email.md)).
- **Date** : 2026-10-05

## Contexte

Les comptes sont obligatoires. Le front et l'API sont sur le même domaine (voir [0002](0002-architecture-globale.md)).
L'agent IA doit aussi pouvoir s'authentifier.

## Décision

**Pour les humains** :

- connexion par email et mot de passe, avec **confirmation de l'email** ;
- mots de passe hachés avec **Argon2id** ;
- session **côté serveur**, stockée en base, et identifiée par un cookie `HttpOnly`, `Secure`, `SameSite=Lax` ;
- protection **CSRF** par jeton pour toutes les requêtes qui modifient des données ;
- **limitation des tentatives** de connexion et de réinitialisation.

**Pour l'agent IA** :

- une **clé d'API** propre au compte de l'agent, transmise dans l'en-tête `Authorization`. Elle est révocable depuis l'administration.

## Conséquences

- ✅ Le jeton n'est pas lisible par JavaScript, ce qui limite les dégâts en cas de faille XSS.
- ✅ Déconnexion immédiate possible : on supprime la session côté serveur.
- ⚠️ Il faut un service d'envoi d'emails (voir la question ouverte n° 2 du cadrage).

## Alternatives écartées

- **JWT stocké dans le navigateur** : impossible à révoquer facilement, et exposé en cas de faille XSS.
- **Connexion via Google ou GitHub** : on pourra l'ajouter plus tard. Ce n'est pas utile en V1.
- **Service externe (Auth0, Clerk)** : coûteux, et les données sortent de l'UE.
