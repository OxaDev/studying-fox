# 0027 — Formules Excel : un mini-moteur de calcul maison

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Complète** : [0026](0026-interpreteur-vba.md), qui laissait les formules hors du champ

## Contexte

Écrire une formule par macro est un geste courant en VBA : `Range("C2:C10").Formula = "=A2*B2"`, et l'enregistreur de macros produit des `FormulaR1C1`.
Le classeur simulé de l'ADR 0026 refusait les formules avec une erreur. Un vrai moteur de tableur (HyperFormula) serait plus complet, mais lourd, sous double licence, et sa compatibilité avec la CSP stricte du worker reste à vérifier.

## Décision

On écrit un **mini-moteur de formules**, à côté de l'interpréteur VBA (`front/src/features/execution/vba/formules*.ts`).

- **Trois syntaxes**, comme Excel : `Formula` (anglais, virgules), `FormulaLocal` (français, points-virgules, virgule décimale) et `FormulaR1C1`. Une formule écrite dans l'une se relit dans les autres.
- **Une référence relative est un décalage** depuis sa cellule. Une formule donnée à toute une plage, ou copiée, se décale donc comme dans Excel ; les références `$A$1` ne bougent pas.
- **Le calcul se fait à la lecture** de la cellule : le résultat est toujours à jour, sans graphe de dépendances. Une référence circulaire vaut 0, comme dans Excel.
- **Une cinquantaine de fonctions courantes** (`SUM`/`SOMME`, `IF`/`SI`, `VLOOKUP`/`RECHERCHEV`, `COUNTIF`/`NB.SI`, `IFERROR`/`SIERREUR`, texte, dates…). Les agrégats et les recherches sont ceux de `WorksheetFunction` : une seule implémentation pour le VBA et les formules.
- **Les erreurs de cellule** (`#DIV/0!`, `#N/A`, `#VALUE!`, `#REF!`, `#NAME?`, `#NUM!`) se propagent. En VBA, elles sont des Variant `Error` (`IsError`, `CVErr`).
- Une fonction inconnue vaut `#NAME?`, comme dans Excel. Une formule mal écrite est refusée avec l'erreur 1004.

## Conséquences

- ✅ Les leçons peuvent enseigner l'écriture de formules par macro, y compris le code de l'enregistreur.
- ✅ Aucune dépendance, et la CSP du worker reste `default-src 'none'`.
- ⚠️ Recalculer à chaque lecture coûte cher sur de grandes feuilles. C'est sans importance pour des leçons ; un cache sera à ajouter si ça change.
- ⚠️ Supprimer ou insérer des lignes ne met pas à jour les références des formules, contrairement à Excel.
- ⚠️ Pas de formules matricielles, de noms définis, ni de tableaux structurés. Chaque fonction manquante s'ajoute avec ses tests.

## Alternatives écartées

- **HyperFormula** : près de 400 fonctions, mais plusieurs centaines de Ko, une double licence GPLv3 ou commerciale, et une CSP à vérifier. À reconsidérer si les leçons ont besoin d'un tableur complet.
- **Garder l'erreur explicite** : elle bloquait un usage courant du VBA.
