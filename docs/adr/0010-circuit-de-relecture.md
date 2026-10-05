# 0010 — Circuit de relecture et rôles

- **Statut** : Accepté. Rôles et règle de publication modifiés par [0019](0019-import-lecons-json.md).
- **Date** : 2026-10-05

## Contexte

N'importe quel contributeur, humain ou IA, peut proposer une leçon.
La qualité et la justesse des contenus sont la priorité.

## Décision

**Rôles** : Apprenant, Contributeur, Relecteur, Admin, Agent IA (le détail est dans le cadrage, section 4).
Les droits sont vérifiés **côté API**, jamais seulement dans l'interface.

**Statuts d'une révision** :

```
brouillon ──soumettre──▶ en_relecture ──publier──▶ publiée
                              │
                              ├──demander des corrections──▶ à_corriger ──▶ (retour en brouillon)
                              └──refuser──▶ refusée
```

**Règles** :

- Personne ne publie son propre contenu.
- Chaque décision est enregistrée, avec qui l'a prise, quand, et un commentaire.
- Si on modifie une leçon déjà publiée, une nouvelle révision suit le même circuit. L'ancienne version reste en ligne jusqu'à la validation.

## Conséquences

- ✅ Aucun contenu n'arrive en ligne sans qu'un humain l'ait lu.
- ✅ Tout se retrace grâce au journal des actions.
- ⚠️ Au début, le porteur du projet sera le seul relecteur. C'est un goulot d'étranglement à anticiper.

## Alternatives écartées

- **Publication directe, puis modération après coup** : trop risqué pour un site d'apprentissage, où une erreur s'apprend.
