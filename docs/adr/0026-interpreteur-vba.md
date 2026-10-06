# 0026 — VBA : un interpréteur maison et un classeur Excel simulé

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Complète** : [0009](0009-execution-code-navigateur.md) (exécution dans le navigateur) et [0021](0021-isolation-du-code-des-lecons.md) (CSP par worker)

## Contexte

Les professionnels veulent apprendre le VBA pour automatiser Excel. Le code doit tourner dans le navigateur (ADR 0009), sans Excel ni serveur.
Aucun interpréteur VBA libre et fiable n'existe pour le navigateur. Et le VBA sert surtout à manipuler un classeur (`Range`, `Cells`, `Worksheets`) : une console ne suffit pas.

## Décision

On écrit **notre propre interpréteur VBA, en TypeScript**, avec un **classeur Excel simulé**. Il tourne dans un Web Worker, comme les autres langages.

- **Le langage** : `Sub` et `Function`, variables typées (`Dim … As`), `Option Explicit`, tableaux et `ReDim`, `If`, `Select Case`, boucles `For`, `For Each` et `Do`, `With`, `ByRef` et `ByVal`, `On Error` et `Err`, `Collection`, `Scripting.Dictionary`, et les fonctions courantes (`Len`, `Split`, `Format`, `DateAdd`…).
- **Le classeur** : il est vide à chaque exécution (une feuille `Feuil1`). On y trouve `Range`, `Cells`, `Offset`, `End(xlUp)`, `CurrentRegion`, `Worksheets.Add`, `Font.Bold`, `NumberFormat`, et les fonctions de `WorksheetFunction` les plus utilisées.
- **Ce qui s'affiche** : `Debug.Print` et `MsgBox` écrivent dans la console. Les feuilles non vides s'affichent sous la console, en tableaux HTML accessibles.
- **Le format d'Excel en français** : virgule décimale, `Vrai` et `Faux`, dates `jj/mm/aaaa`. Les messages d'erreur reprennent ceux d'Excel, avec leur numéro et leur ligne.
- **La CSP du worker** : `default-src 'none'`. L'interpréteur est du code ordinaire : le worker n'a besoin ni d'`eval`, ni de WebAssembly, ni du réseau.
- **Hors du champ** : les formules Excel ne sont pas calculées (une erreur l'explique). Pas d'`InputBox`, ni de formulaires, ni de fichiers, ni d'événements.

## Conséquences

- ✅ Les leçons VBA se lancent et se vérifient comme les autres : la `sortie_attendue` est comparée à l'import.
- ✅ L'interpréteur ne pèse que quelques dizaines de Ko, et démarre tout de suite.
- ✅ La CSP la plus stricte de tous les workers.
- ⚠️ C'est du code à maintenir : chaque fonction VBA ou propriété Excel manquante doit être ajoutée, avec ses tests (`front/src/features/execution/vba/`).
- ⚠️ Le comportement peut différer d'Excel dans les cas limites (types numériques des calculs intermédiaires, formats rares). Les leçons restent sur le VBA courant.
- ⚠️ Les leçons qui ont besoin de données les créent dans leur code : le classeur part toujours vide.

## Alternatives écartées

- **Leçons VBA sans exécution** : contraire au guide de rédaction (chaque notion a un exemple à lancer), et rien n'est vérifié à l'import.
- **Exécuter le code dans un vrai Excel, sur un serveur** : coût, licences et risques de sécurité (ADR 0009).
- **Enseigner Office Scripts ou Python à la place** : ce n'est pas le VBA que les apprenants trouvent dans leurs classeurs.
