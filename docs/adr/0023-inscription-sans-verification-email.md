# 0023 — Inscription sans vérification de l'email, en attendant un service d'envoi

- **Statut** : Accepté
- **Date** : 2026-10-05
- **Précise** : [0008](0008-authentification.md). La confirmation de l'email devient un réglage.

## Contexte

L'ADR 0008 prévoit de confirmer l'email par un lien. Il n'y a pas encore de service d'envoi d'emails : aucun lien ne partirait, et personne ne pourrait activer son compte.

## Décision

La vérification est un réglage, `RENARD_VERIFICATION_EMAIL`, **coupé par défaut**.

| | Sans vérification (aujourd'hui) | Avec vérification |
|---|---|---|
| Inscription | Email obligatoire et valide, compte utilisable tout de suite | Lien de confirmation |
| Adresse déjà inscrite | Signalée : « Cette adresse email est déjà utilisée. » | Réponse identique, email au titulaire |
| Changement d'adresse | Immédiat, après le mot de passe | Lien envoyé à la nouvelle adresse |
| Mot de passe oublié | Lien masqué à la connexion | Proposé |
| Purge à 30 jours | Aucun compte supprimé | Comptes non confirmés supprimés |

Le front lit ce réglage avec `GET /api/comptes/reglages`.
Le code de la vérification reste en place et testé : il suffira d'activer le réglage.

## Conséquences

- ✅ On peut ouvrir des comptes sans attendre le service d'envoi.
- ⚠️ Une adresse peut appartenir à quelqu'un d'autre. Elle ne sert qu'à se connecter : aucun message n'y est envoyé.
- ⚠️ Signaler une adresse déjà inscrite révèle qui a un compte. Sans email, c'est le seul moyen de prévenir la personne. La limitation des tentatives freine les essais en masse.
- ⚠️ Un mot de passe oublié ne se récupère pas encore. Une réinitialisation par un admin reste à prévoir si le besoin se présente.
- ⚠️ **À l'activation**, les comptes existants n'ont pas d'email confirmé : ils seraient bloqués à la connexion puis purgés. Il faudra d'abord les marquer comme confirmés, ou leur demander de confirmer, avec une migration.

## Alternatives écartées

- **Confirmer d'office toutes les adresses** : les écrans afficheraient « confirmé » pour des adresses jamais vérifiées.
- **Envoyer les liens dans les logs, comme en développement** : seul l'hébergeur les verrait. Personne ne pourrait s'inscrire seul.
