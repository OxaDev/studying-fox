# 0022 — Un brouillon reste modifiable jusqu'à sa soumission

- **Statut** : Accepté
- **Date** : 2026-10-05
- **Précise** : [0006](0006-contenus-en-base.md) et [0010](0010-circuit-de-relecture.md)

## Contexte

L'ADR 0006 dit qu'on ne modifie jamais une révision : chaque modification en crée une nouvelle.
Appliquée à la lettre, cette règle crée une version à chaque clic sur « Enregistrer » pendant la rédaction, ce qui noie l'historique sous des dizaines de versions sans intérêt.

## Décision

- Une révision au statut **brouillon** appartient à son auteur, qui peut la modifier autant qu'il veut.
- Dès qu'elle est **soumise à relecture**, elle est **figée** et n'est plus jamais modifiée.
- Si le relecteur **demande des corrections**, l'auteur clique sur « Reprendre » : cela crée une **nouvelle révision** (brouillon) copiée de la précédente. La version relue et son commentaire restent dans l'historique.
- Pour **modifier une leçon publiée**, un contributeur crée une nouvelle révision à partir de la version en ligne. Il n'a qu'une proposition ouverte à la fois par leçon.
- Un brouillon jamais soumis peut être supprimé par son auteur.
- Un brouillon peut être incomplet. C'est la soumission qui vérifie que tout est rempli.

## Conséquences

- ✅ L'historique ne contient que des versions qui ont compté : soumises, relues ou publiées.
- ✅ Le relecteur voit toujours exactement ce qu'il a relu.
- ⚠️ Un brouillon n'a pas d'historique propre : l'auteur ne peut pas revenir à son enregistrement précédent.

## Alternatives écartées

- **Une révision par enregistrement** : l'historique devient illisible et la base grossit sans raison.
- **Modifier la version « à corriger » directement** : le relecteur ne pourrait plus voir ce qu'il avait relu.
