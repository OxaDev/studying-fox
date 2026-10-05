# 0019 — Import de leçons au format JSON

- **Statut** : Accepté
- **Date** : 2026-10-05
- **Remplace** : [0011](0011-contenus-generes-par-ia.md). **Modifie** : [0008](0008-authentification.md) et [0010](0010-circuit-de-relecture.md).

## Contexte

Des agents IA écriront les leçons **en dehors de la plateforme**.
Le porteur du projet veut qu'un agent connaisse un format de fichier, produise des leçons dans ce format, puis qu'un humain les importe, les relise et les publie.

## Décision

**Un format de fichier public et versionné**, décrit dans [docs/format-lecon/](../format-lecon/README.md) :

- un **JSON Schema** qui fait foi, avec un exemple et un guide de rédaction ;
- un fichier `.json`, ou un `.zip` (le JSON plus ses images) ;
- un paquet contient 1 à 50 leçons et, si on veut, un parcours qui les regroupe.

**L'import**, dans l'interface d'administration, est réservé aux **Relecteurs et Admins** :

1. On dépose le fichier.
2. La plateforme le **vérifie** : conformité au schéma, thèmes existants, images, et exécution des exemples de code comparée à `sortie_attendue`. Cette exécution a lieu dans le navigateur de la personne qui importe ([0009](0009-execution-code-navigateur.md)).
3. Un **aperçu** liste ce qui sera créé ou modifié, avec les éventuelles erreurs. C'est tout ou rien : s'il y a une erreur, rien n'est importé.
4. Chaque leçon devient une **révision au statut `brouillon`**, marquée « assistée par IA » si le paquet l'indique. Si le slug existe déjà, on crée une nouvelle révision de la leçon existante. Les blocs sont convertis en Markdown, le format de stockage défini dans [0006](0006-contenus-en-base.md).
5. Le circuit normal s'applique ensuite : relecture, puis publication.

**Effets sur les autres ADR** :

- L'agent IA **n'a plus de compte ni de clé d'API**. Le rôle « Agent IA » disparaît ([0008](0008-authentification.md), [0010](0010-circuit-de-relecture.md)).
- Pour un contenu importé, la personne qui importe est **responsable de la relecture**. Elle peut publier le contenu, puisqu'elle n'en est pas l'autrice. La règle « personne ne publie son propre contenu » s'applique toujours aux contenus rédigés dans l'éditeur.
- Chaque import est inscrit au journal des actions : qui, quand, quel fichier, combien de leçons.

## Conséquences

- ✅ N'importe quel agent ou outil peut produire des leçons, sans accès à la plateforme ni secret à gérer.
- ✅ Le format est simple à apprendre pour une IA : un schéma, un exemple, des règles.
- ✅ Le fichier peut être relu, versionné dans Git et corrigé avant l'import.
- ⚠️ Le format devient un **contrat** : toute évolution passe à `version: 2`, et l'ancienne version reste acceptée un temps.
- ⚠️ Le JSON Schema doit être **le même fichier** pour la documentation et pour la validation dans l'API. Il sera déplacé dans le code au démarrage du back.

## Alternatives écartées

- **Agent connecté à l'API** (ancien ADR 0011) : l'agent a besoin d'une clé d'API et de droits, et le porteur préfère un flux par fichier.
- **Fichiers Markdown avec en-tête YAML** : plus agréable à écrire, mais plus difficile à valider strictement. Les blocs JSON permettent de vérifier chaque exemple de code.
