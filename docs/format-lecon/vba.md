# Écrire des leçons VBA

Le VBA s'exécute dans le navigateur, sur un **classeur Excel simulé** ([ADR 0026](../adr/0026-interpreteur-vba.md)).
Ce guide complète les [règles de rédaction](README.md#règles-de-rédaction) : il dit ce qui marche, et comment écrire la `sortie_attendue`.

## Un bloc VBA

```json
{
  "type": "code",
  "langage": "vba",
  "code": "Sub Main()\n    Range(\"A1\").Value = \"Total\"\n    Range(\"B1\").Value = 12.5\n    Debug.Print \"Total : \" & Range(\"B1\").Value\nEnd Sub\n",
  "executable": true,
  "sortie_attendue": "Total : 12,5\n"
}
```

- Le code est un **module** : la plateforme lance **la première `Sub` sans paramètre**. Mets donc `Sub Main()` en premier, et les procédures d'aide après.
- Une instruction hors d'une procédure est refusée, comme dans Excel.
- `Debug.Print` et `MsgBox` écrivent dans la console. C'est ce texte qui est comparé à `sortie_attendue`.
- Les feuilles non vides s'affichent sous la console. Elles ne comptent pas dans `sortie_attendue` : pour vérifier une cellule, affiche-la avec `Debug.Print`.

## Le classeur part vide

À chaque exécution, le classeur contient une seule feuille vide, **`Feuil1`**.
Une leçon qui a besoin de données les écrit au début du code : c'est le rôle du code de départ d'un exercice.

```vba
Sub Main()
    ' Les données de l'exercice
    Range("A1:B1").Value = Array("Produit", "Prix")
    Range("A2:B2").Value = Array("Café", 2.5)
    Range("A3:B3").Value = Array("Thé", 3)
    ' À toi de jouer : affiche le prix total
End Sub
```

## Écrire la sortie attendue

L'affichage suit un **Excel réglé en français**, et `Debug.Print` a ses habitudes :

| Code | Sortie |
|---|---|
| `Debug.Print 42` | ` 42 ` : une espace avant (la place du signe) et une après |
| `Debug.Print -3` | `-3 ` |
| `Debug.Print "Total : " & 42` | `Total : 42` : pas d'espace, le nombre est devenu du texte |
| `Debug.Print 3.5` | ` 3,5 ` : virgule décimale |
| `Debug.Print True` | `Vrai` |
| `Debug.Print "a"; "b"` | `ab` |
| `Debug.Print "a", "b"` | `a` puis des espaces jusqu'à la colonne 15, puis `b` |
| `Debug.Print Date` | `06/10/2026` |
| `MsgBox "Bonjour"` | `Bonjour` |

Pour une sortie simple à prévoir, concatène avec `&`.
Pour connaître la sortie exacte, **exécute le code** avec l'outil de la plateforme (Node 22, dans `front/`) :

```bash
npm run vba -- mon-code.bas
```

La sortie standard est la `sortie_attendue`. Les feuilles et l'erreur éventuelle s'affichent à part.

## Ce qui est disponible

**Le langage** : `Sub`, `Function`, `Dim … As`, `Const`, `Option Explicit`, `Option Base`, `Option Compare Text`, tableaux, `ReDim Preserve`, `If`, `Select Case`, `For`, `For Each`, `Do … Loop`, `While … Wend`, `With`, `Exit`, `ByRef`, `ByVal`, `Optional`, `ParamArray`, arguments nommés (`After:=`), `On Error Resume Next`, `On Error GoTo`, `Resume`, `Err`, `Collection`, `CreateObject("Scripting.Dictionary")`.

**Les fonctions** : textes (`Len`, `Left`, `Mid`, `InStr`, `Replace`, `Split`, `Join`, `Trim`, `UCase`, `Format`…), conversions (`CInt`, `CLng`, `CDbl`, `CStr`, `CDate`, `Val`…), tests (`IsNumeric`, `IsEmpty`, `IsDate`, `TypeName`…), nombres (`Round`, `Int`, `Abs`, `Sqr`, `Rnd`…), dates (`Date`, `Now`, `DateSerial`, `DateAdd`, `DateDiff`, `Year`, `Weekday`…), `IIf`, `Choose`, `Array`, `UBound`, `MsgBox`.

**Excel** :

| Objet | Ce qui marche |
|---|---|
| Plages | `Range("A1")`, `Range("A1:C3")`, `Cells(2, 1)`, `Cells(2, "A")`, `Rows(3)`, `Columns("B")` |
| Lire et écrire | `.Value` (une cellule ou un tableau à deux dimensions), `.Text`, `.Formula`, `.FormulaLocal`, `.FormulaR1C1`, `.HasFormula` |
| Se déplacer | `.Offset`, `.Resize`, `.End(xlUp)`, `.CurrentRegion`, `.EntireRow`, `.Row`, `.Column`, `.Address`, `.Count` |
| Modifier | `.ClearContents`, `.Clear`, `.Delete`, `.Insert`, `.Copy Destination:=`, `.Find` |
| Mettre en forme | `.Font.Bold`, `.Font.Italic`, `.Font.Color`, `.Interior.Color`, `.NumberFormat` |
| Feuilles | `Worksheets("Nom")`, `Sheets(1)`, `Worksheets.Add`, `.Name`, `.Delete`, `.Activate`, `ActiveSheet`, `UsedRange` |
| Fonctions de feuille | `WorksheetFunction.Sum`, `Average`, `Max`, `Min`, `Count`, `CountA`, `CountIf`, `SumIf`, `VLookup`, `Match`, `Index`, `Round`, `Transpose`… |

Seuls le gras et l'italique se voient dans le tableau affiché. Les couleurs sont gardées, et se relisent avec `.Interior.Color`.

## Les formules

Les formules sont calculées ([ADR 0027](../adr/0027-formules-excel.md)) :

```vba
Range("C2:C4").Formula = "=A2*B2"              ' en anglais, virgules : se décale ligne par ligne
Range("C5").FormulaLocal = "=SOMME(C2:C4)"     ' en français, points-virgules
ActiveCell.FormulaR1C1 = "=RC[-2]*RC[-1]"      ' comme l'enregistreur de macros
Debug.Print Range("C5").Value                  ' la valeur calculée
```

- Une formule est recalculée chaque fois qu'on lit la cellule : elle suit les données.
- Les références relatives se décalent quand la formule est donnée à une plage ou copiée (`.Copy Destination:=`) ; `$A$1` ne bouge pas. `PasteSpecial` colle les valeurs.
- Fonctions disponibles (nom anglais / français) : `SUM`/`SOMME`, `AVERAGE`/`MOYENNE`, `MIN`, `MAX`, `COUNT`/`NB`, `COUNTA`/`NBVAL`, `COUNTIF`/`NB.SI`, `SUMIF`/`SOMME.SI`, `AVERAGEIF`/`MOYENNE.SI`, `IF`/`SI`, `IFERROR`/`SIERREUR`, `AND`/`ET`, `OR`/`OU`, `NOT`/`NON`, `VLOOKUP`/`RECHERCHEV`, `MATCH`/`EQUIV`, `INDEX`, `ROUND`/`ARRONDI`, `INT`/`ENT`, `MOD`, `ABS`, `CONCATENATE`/`CONCATENER`, `LEFT`/`GAUCHE`, `RIGHT`/`DROITE`, `MID`/`STXT`, `LEN`/`NBCAR`, `UPPER`/`MAJUSCULE`, `TEXT`/`TEXTE`, `TODAY`/`AUJOURDHUI`, `DATE`, `YEAR`/`ANNEE`… et quelques autres.
- Une fonction inconnue donne `#NAME?`. Les erreurs (`#DIV/0!`, `#N/A`…) se propagent ; en VBA, `IsError(Range("A1").Value)` les détecte.
- Une formule mal écrite (parenthèse manquante, `;` dans `.Formula`) s'arrête sur l'erreur 1004.

## Ce qui n'est pas disponible

- Les formules matricielles, les noms définis et les tableaux structurés. Supprimer ou insérer des lignes ne met pas à jour les références des formules.
- `InputBox`, les formulaires (UserForm), les fichiers, les événements (`Worksheet_Change`), `Type` et `Enum`, `GoSub`.
- Les tris et filtres (`.Sort`, `.AutoFilter`) et `.SpecialCells`.

Si une leçon a besoin d'un de ces éléments, signale-le : l'interpréteur se complète au besoin (`front/src/features/execution/vba/`).
