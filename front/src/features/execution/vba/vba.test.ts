import { describe, expect, it } from "vitest";

import { formater } from "./format";
import { executerVba } from "./interpreteur";

function executer(code: string) {
  let sortie = "";
  const resultat = executerVba(code, {
    ecrire: (texte) => {
      sortie += texte;
    },
    maintenant: () => new Date(2026, 9, 6, 14, 30, 5),
    aleatoire: () => 0.5,
  });
  return { sortie, ...resultat };
}

/** Exécute des instructions placées dans Sub Main(). */
function main(corps: string) {
  return executer(`Sub Main()\n${corps}\nEnd Sub`);
}

/** Affiche le résultat, ou l'erreur. */
function sortie(corps: string): string {
  const resultat = main(corps);
  return resultat.erreur ? `${resultat.sortie}${resultat.erreur}` : resultat.sortie;
}

function grille(corps: string, feuille = 0): string[][] {
  const resultat = main(corps);
  if (resultat.erreur) throw new Error(resultat.erreur);
  return (resultat.feuilles[feuille]?.lignes ?? []).map((ligne) =>
    ligne.map((cellule) => cellule?.texte ?? ""),
  );
}

describe("VBA : affichage", () => {
  it("Debug.Print met une espace autour des nombres, comme Excel", () => {
    expect(sortie('Debug.Print "Bonjour"')).toBe("Bonjour\n");
    expect(sortie("Debug.Print 42")).toBe(" 42 \n");
    expect(sortie("Debug.Print -3")).toBe("-3 \n");
    expect(sortie('Debug.Print "Total : " & 42')).toBe("Total : 42\n");
  });

  it("Debug.Print accepte ; et , entre les valeurs", () => {
    expect(sortie('Debug.Print "a"; "b"')).toBe("ab\n");
    expect(sortie('Debug.Print "a", "b"')).toBe("a             b\n");
    expect(sortie('Debug.Print "a";\nDebug.Print "b"')).toBe("ab\n");
  });

  it("écrit les nombres et les booléens à la française", () => {
    expect(sortie("Debug.Print 3.5")).toBe(" 3,5 \n");
    expect(sortie("Debug.Print 0.1 + 0.2")).toBe(" 0,3 \n");
    expect(sortie("Debug.Print True; False")).toBe("VraiFaux\n");
    expect(sortie('Debug.Print 1 / 3 & ""')).toBe("0,333333333333333\n");
  });

  it("MsgBox affiche son message dans la console", () => {
    expect(sortie('MsgBox "Bonjour " & "Aiko"')).toBe("Bonjour Aiko\n");
    expect(sortie('Debug.Print MsgBox("Continuer ?", vbYesNo) = vbYes')).toBe(
      "Continuer ?\nVrai\n",
    );
  });
});

describe("VBA : le module", () => {
  it("lance la première Sub sans paramètre", () => {
    const code = [
      "Sub Aider(n As Long)",
      '  Debug.Print "aide"',
      "End Sub",
      "Sub Lancer()",
      '  Debug.Print "lancée"',
      "End Sub",
    ].join("\n");
    expect(executer(code).sortie).toBe("lancée\n");
  });

  it("refuse le code hors d'une procédure", () => {
    expect(executer('Debug.Print "x"').erreur).toBe(
      "Erreur de compilation (ligne 1) : Instruction incorrecte hors d'une procédure : place ton code entre « Sub Main() » et « End Sub »",
    );
  });

  it("ne distingue pas les majuscules des minuscules", () => {
    expect(executer("sub main()\n  DIM x as long\n  X = 2\n  debug.print x\nEND SUB").sortie).toBe(
      " 2 \n",
    );
  });

  it("ignore les commentaires et suit les lignes coupées par _", () => {
    expect(sortie("' un commentaire\nRem un autre\nDebug.Print 1 + _\n    2 ' fin")).toBe(" 3 \n");
  });

  it("accepte plusieurs instructions sur une ligne avec :", () => {
    expect(sortie("Dim a: a = 1: Debug.Print a")).toBe(" 1 \n");
  });

  it("ignore les lignes Attribute d'un module exporté", () => {
    expect(
      executer('Attribute VB_Name = "Module1"\nSub Main()\nDebug.Print "ok"\nEnd Sub').sortie,
    ).toBe("ok\n");
  });
});

describe("VBA : variables et types", () => {
  it("Option Explicit exige la déclaration des variables, avant d'exécuter", () => {
    const resultat = executer(
      'Option Explicit\nSub Main()\nDebug.Print "avant"\ntotal = 1\nEnd Sub',
    );
    expect(resultat.sortie).toBe("");
    expect(resultat.erreur).toBe(
      "Erreur de compilation (ligne 4) : Variable non définie : « total »",
    );
  });

  it("sans Option Explicit, une variable non déclarée est un Variant vide", () => {
    expect(sortie("Debug.Print IsEmpty(x); TypeName(x)")).toBe("VraiEmpty\n");
  });

  it("convertit vers le type déclaré", () => {
    expect(sortie("Dim n As Integer\nn = 2.5\nDebug.Print n")).toBe(" 2 \n");
    expect(sortie("Dim n As Integer\nn = 3.5\nDebug.Print n")).toBe(" 4 \n");
    expect(sortie('Dim s As String\ns = 12\nDebug.Print s & "!"')).toBe("12!\n");
    expect(sortie('Dim b As Boolean\nb = "Vrai"\nDebug.Print b')).toBe("Vrai\n");
  });

  it("signale le dépassement de capacité d'un Integer", () => {
    expect(sortie("Dim n As Integer\nn = 32767\nn = n + 1")).toBe(
      "Erreur d'exécution 6 (ligne 4) : Dépassement de capacité",
    );
  });

  it("signale une incompatibilité de type", () => {
    expect(sortie('Dim n As Long\nn = "abc"')).toBe(
      "Erreur d'exécution 13 (ligne 3) : Incompatibilité de type",
    );
  });

  it("TypeName donne le type déclaré", () => {
    expect(
      sortie(
        'Dim d As Double, s As String\nd = 5\nDebug.Print TypeName(d); " "; TypeName(s); " "; TypeName(Range("A1"))',
      ),
    ).toBe("Double String Range\n");
  });

  it("refuse d'affecter une constante", () => {
    expect(main("Const TVA = 0.2\nTVA = 1").erreur).toBe(
      "Erreur de compilation (ligne 3) : Affectation à la constante « TVA » impossible",
    );
  });

  it("garde les variables du module entre deux procédures", () => {
    const code = [
      "Dim compteur As Long",
      "Sub Main()",
      "  Ajouter",
      "  Ajouter",
      "  Debug.Print compteur",
      "End Sub",
      "Sub Ajouter()",
      "  compteur = compteur + 1",
      "End Sub",
    ].join("\n");
    expect(executer(code).sortie).toBe(" 2 \n");
  });
});

describe("VBA : opérateurs", () => {
  it("calcule comme VBA", () => {
    expect(sortie("Debug.Print 7 \\ 2; 7 Mod 3; 2 ^ 3; -2 ^ 2; 10 / 4")).toBe(
      " 3  1  8 -4  2,5 \n",
    );
    expect(sortie('Debug.Print "1" + 2; "a" + "b"; "2" & 3')).toBe(" 3 ab23\n");
  });

  it("compare des textes et des nombres", () => {
    expect(sortie('Debug.Print "abc" < "abd"; "B" < "a"; 10 = "10"')).toBe("VraiVraiVrai\n");
  });

  it("Option Compare Text ignore la casse", () => {
    expect(
      executer('Option Compare Text\nSub Main()\nDebug.Print "ABC" = "abc"\nEnd Sub').sortie,
    ).toBe("Vrai\n");
  });

  it("And, Or et Not sont logiques entre booléens, bit à bit entre nombres", () => {
    expect(sortie("Debug.Print True And False; Not True; 6 And 3; 4 Or 1")).toBe(
      "FauxFaux 2  5 \n",
    );
  });

  it("Like reconnaît les motifs", () => {
    expect(
      sortie('Debug.Print "Facture-2024" Like "Facture-####"; "Bob" Like "B?b"; "x" Like "[!a-c]"'),
    ).toBe("VraiVraiVrai\n");
  });

  it("refuse une division par zéro", () => {
    expect(sortie("Debug.Print 1 / 0")).toBe("Erreur d'exécution 11 (ligne 2) : Division par zéro");
  });
});

describe("VBA : structures de contrôle", () => {
  it("If, ElseIf, Else et le If sur une ligne", () => {
    const code = [
      "Dim n As Long",
      "For n = 1 To 3",
      '  If n = 1 Then\n    Debug.Print "un"\n  ElseIf n = 2 Then\n    Debug.Print "deux"\n  Else\n    Debug.Print "trois"\n  End If',
      "Next n",
      'If n > 3 Then Debug.Print "fini" Else Debug.Print "encore"',
      'If n > 10 Then Debug.Print "jamais"',
      'Debug.Print "suite"',
    ].join("\n");
    expect(sortie(code)).toBe("un\ndeux\ntrois\nfini\nsuite\n");
  });

  it("For avec Step, et Exit For", () => {
    expect(sortie("Dim i\nFor i = 10 To 1 Step -3\nDebug.Print i;\nNext")).toBe(" 10  7  4  1 \n");
    expect(sortie("Dim i\nFor i = 1 To 10\nIf i = 3 Then Exit For\nNext\nDebug.Print i")).toBe(
      " 3 \n",
    );
  });

  it("les boucles Do et While", () => {
    expect(sortie("Dim n: n = 0\nDo While n < 3\nn = n + 1\nLoop\nDebug.Print n")).toBe(" 3 \n");
    expect(sortie("Dim n: n = 5\nDo\nn = n + 1\nLoop Until n >= 3\nDebug.Print n")).toBe(" 6 \n");
    expect(sortie("Dim n: n = 0\nDo\nn = n + 1\nIf n = 4 Then Exit Do\nLoop\nDebug.Print n")).toBe(
      " 4 \n",
    );
    expect(sortie("Dim n: n = 0\nWhile n < 2\nn = n + 1\nWend\nDebug.Print n")).toBe(" 2 \n");
  });

  it("Select Case : valeurs, intervalles et Is", () => {
    const code = (note: number) =>
      `Select Case ${String(note)}\n  Case 0, 1: Debug.Print "nul"\n  Case 2 To 9: Debug.Print "moyen"\n  Case Is >= 10: Debug.Print "bien"\n  Case Else: Debug.Print "?"\nEnd Select`;
    expect(sortie(code(1))).toBe("nul\n");
    expect(sortie(code(5))).toBe("moyen\n");
    expect(sortie(code(12))).toBe("bien\n");
    expect(sortie(code(-1))).toBe("?\n");
  });

  it("With raccourcit les accès à un objet", () => {
    expect(
      grille(
        'With Range("A1")\n  .Value = "Titre"\n  .Font.Bold = True\n  .Offset(0, 1).Value = 2\nEnd With',
      ),
    ).toEqual([["Titre", "2"]]);
  });

  it("End arrête tout le programme", () => {
    expect(sortie('Debug.Print "a"\nEnd\nDebug.Print "b"')).toBe("a\n");
  });
});

describe("VBA : procédures et fonctions", () => {
  it("une fonction renvoie la valeur affectée à son nom, et peut être récursive", () => {
    const code = [
      "Sub Main()",
      "  Debug.Print Factorielle(5)",
      "End Sub",
      "Function Factorielle(n As Long) As Long",
      "  If n <= 1 Then",
      "    Factorielle = 1",
      "  Else",
      "    Factorielle = n * Factorielle(n - 1)",
      "  End If",
      "End Function",
    ].join("\n");
    expect(executer(code).sortie).toBe(" 120 \n");
  });

  it("ByRef modifie la variable de l'appelant, ByVal non", () => {
    const code = [
      "Sub Main()",
      "  Dim a As Long, b As Long",
      "  a = 1: b = 1",
      "  Changer a, b",
      "  Debug.Print a; b",
      "End Sub",
      "Sub Changer(x As Long, ByVal y As Long)",
      "  x = 10: y = 10",
      "End Sub",
    ].join("\n");
    expect(executer(code).sortie).toBe(" 10  1 \n");
  });

  it("refuse une variable d'un autre type passée ByRef, comme l'éditeur VBA", () => {
    const code = [
      "Sub Main()",
      "  Dim a As Integer",
      "  Doubler a",
      "End Sub",
      "Sub Doubler(n As Long)",
      "End Sub",
    ].join("\n");
    expect(executer(code).erreur).toMatch(
      /^Erreur de compilation \(ligne 3\) : Type d'argument ByRef incompatible/,
    );
  });

  it("paramètres facultatifs, nommés et Call", () => {
    const code = [
      "Sub Main()",
      '  Call Saluer("Aiko")',
      '  Saluer "Kitsune", formule:="Salut"',
      "End Sub",
      'Sub Saluer(nom As String, Optional formule As String = "Bonjour")',
      '  Debug.Print formule & " " & nom',
      "End Sub",
    ].join("\n");
    expect(executer(code).sortie).toBe("Bonjour Aiko\nSalut Kitsune\n");
  });

  it("Exit Sub quitte la procédure", () => {
    expect(sortie('Debug.Print "a"\nExit Sub\nDebug.Print "b"')).toBe("a\n");
  });

  it("signale une procédure inconnue avant d'exécuter", () => {
    expect(main('Debug.Print "a"\nCalculer 3').erreur).toBe(
      "Erreur de compilation (ligne 3) : Sub ou Function non définie : « Calculer »",
    );
  });

  it("arrête une récursion sans fin", () => {
    const code = "Sub Main()\n  Main\nEnd Sub";
    expect(executer(code).erreur).toMatch(/^Erreur d'exécution 28/);
  });
});

describe("VBA : gestion des erreurs", () => {
  it("On Error Resume Next continue et renseigne Err", () => {
    expect(
      sortie("On Error Resume Next\nDebug.Print 1 / 0\nDebug.Print Err.Number; Err.Description"),
    ).toBe(" 11 Division par zéro\n");
  });

  it("On Error GoTo saute au gestionnaire, Resume Next reprend dans la boucle", () => {
    const code = [
      "On Error GoTo Erreur",
      "Dim i",
      "For i = 1 To 3",
      "  Debug.Print 6 / (i - 2)",
      "Next i",
      'Debug.Print "fin"',
      "Exit Sub",
      "Erreur:",
      '  Debug.Print "erreur " & Err.Number',
      "  Resume Next",
    ].join("\n");
    expect(sortie(code)).toBe("-6 \nerreur 11\n 6 \nfin\n");
  });

  it("sans Resume, le gestionnaire termine la procédure", () => {
    expect(
      sortie(
        'On Error GoTo Erreur\nErr.Raise 1000, , "Stock vide"\nDebug.Print "jamais"\nErreur:\nDebug.Print Err.Description',
      ),
    ).toBe("Stock vide\n");
  });

  it("Err.Raise lève une erreur personnalisée", () => {
    expect(sortie('Err.Raise 1001, , "Montant négatif"')).toBe(
      "Erreur d'exécution 1001 (ligne 2) : Montant négatif",
    );
  });

  it("On Error GoTo 0 rétablit l'arrêt sur erreur", () => {
    expect(sortie("On Error Resume Next\nOn Error GoTo 0\nDebug.Print 1 / 0")).toBe(
      "Erreur d'exécution 11 (ligne 4) : Division par zéro",
    );
  });

  it("signale une étiquette absente", () => {
    expect(main("On Error GoTo Nulle").erreur).toBe(
      "Erreur de compilation (ligne 2) : Étiquette non définie : « nulle »",
    );
  });

  it("l'erreur d'une procédure appelée remonte au gestionnaire de l'appelant", () => {
    const code = [
      "Sub Main()",
      "  On Error Resume Next",
      "  Diviser",
      '  Debug.Print "Erreur " & Err.Number',
      "End Sub",
      "Sub Diviser()",
      "  Debug.Print 1 / 0",
      "End Sub",
    ].join("\n");
    expect(executer(code).sortie).toBe("Erreur 11\n");
  });

  it("indique la ligne de l'erreur dans la procédure appelée", () => {
    const code = [
      "Sub Main()",
      "  Calcul",
      "End Sub",
      "Sub Calcul()",
      "  Dim t(2)",
      "  t(5) = 1",
      "End Sub",
    ].join("\n");
    expect(executer(code).erreur).toBe(
      "Erreur d'exécution 9 (ligne 6) : L'indice n'appartient pas à la sélection",
    );
  });
});

describe("VBA : tableaux", () => {
  it("Dim t(n) commence à 0, ou à la borne donnée", () => {
    expect(sortie("Dim t(3) As Long\nDebug.Print LBound(t); UBound(t)")).toBe(" 0  3 \n");
    expect(sortie("Dim t(1 To 5)\nDebug.Print LBound(t); UBound(t)")).toBe(" 1  5 \n");
    expect(
      executer("Option Base 1\nSub Main()\nDim t(3)\nDebug.Print LBound(t)\nEnd Sub").sortie,
    ).toBe(" 1 \n");
  });

  it("ReDim Preserve agrandit sans perdre les valeurs", () => {
    expect(
      sortie(
        'Dim t() As String\nReDim t(1)\nt(0) = "a": t(1) = "b"\nReDim Preserve t(2)\nt(2) = "c"\nDebug.Print Join(t, "-")',
      ),
    ).toBe("a-b-c\n");
  });

  it("tableaux à deux dimensions", () => {
    expect(sortie("Dim m(1 To 2, 1 To 3)\nm(2, 3) = 7\nDebug.Print m(2, 3); UBound(m, 2)")).toBe(
      " 7  3 \n",
    );
  });

  it("Array, Split, Join et For Each", () => {
    expect(sortie('Dim v\nFor Each v In Split("a;b;c", ";")\nDebug.Print v;\nNext')).toBe("abc\n");
    expect(sortie('Debug.Print Join(Array(1, 2, 3), ", ")')).toBe("1, 2, 3\n");
  });

  it("refuse un indice hors du tableau", () => {
    expect(sortie("Dim t(2)\nt(3) = 1")).toBe(
      "Erreur d'exécution 9 (ligne 3) : L'indice n'appartient pas à la sélection",
    );
  });

  it("une affectation copie le tableau", () => {
    expect(sortie("Dim a, b\na = Array(1, 2)\nb = a\nb(0) = 9\nDebug.Print a(0); b(0)")).toBe(
      " 1  9 \n",
    );
  });
});

describe("VBA : fonctions intégrées", () => {
  it("textes", () => {
    expect(
      sortie(
        'Debug.Print Len("Renard"); Left("Renard", 3); Right("Renard", 2); Mid("Renard", 2, 3)',
      ),
    ).toBe(" 6 Renrdena\n");
    expect(sortie('Debug.Print UCase("abc"); LCase("ABC"); "[" & Trim("  x  ") & "]"')).toBe(
      "ABCabc[x]\n",
    );
    expect(
      sortie('Debug.Print InStr("bonjour", "j"); InStr(5, "abcabc", "b"); InStr("abc", "z")'),
    ).toBe(" 4  5  0 \n");
    expect(sortie('Debug.Print Replace("a-b-c", "-", "/"); StrReverse("abc")')).toBe("a/b/ccba\n");
  });

  it("conversions et tests", () => {
    expect(sortie('Debug.Print CInt("12") + 1; CDbl("3,5"); Val("12.5 kg"); CStr(2.5)')).toBe(
      " 13  3,5  12,5 2,5\n",
    );
    expect(sortie('Debug.Print IsNumeric("12,5"); IsNumeric("abc"); IsDate("31/12/2024")')).toBe(
      "VraiFauxVrai\n",
    );
    expect(
      sortie("Debug.Print Round(2.5); Round(3.5); Round(2.567, 2); Int(-2.5); Fix(-2.5)"),
    ).toBe(" 2  4  2,57 -3 -2 \n");
  });

  it("Format, avec les réglages français", () => {
    expect(
      sortie(
        'Debug.Print Format(1234.5, "#,##0.00"); " | "; Format(0.256, "0.0%"); " | "; Format(5, "000")',
      ),
    ).toBe("1 234,50 | 25,6% | 005\n");
    expect(
      sortie(
        'Debug.Print Format(#3/15/2024#, "dd/mm/yyyy"); " "; Format(#3/15/2024#, "dddd d mmmm yyyy")',
      ),
    ).toBe("15/03/2024 vendredi 15 mars 2024\n");
  });

  it("dates", () => {
    expect(sortie("Debug.Print Date; Year(Date); Month(Now)")).toBe("06/10/2026 2026  10 \n");
    expect(
      sortie('Debug.Print DateAdd("m", 1, #1/31/2024#); DateDiff("d", #1/1/2024#, #3/1/2024#)'),
    ).toBe("29/02/2024 60 \n");
    expect(sortie("Debug.Print DateSerial(2024, 13, 1); Weekday(#10/6/2026#, vbMonday)")).toBe(
      "01/01/2025 2 \n",
    );
  });

  it("IIf évalue ses deux branches, comme VBA", () => {
    expect(sortie('Debug.Print IIf(3 > 2, "oui", "non")')).toBe("oui\n");
  });

  it("InputBox n'est pas disponible", () => {
    expect(sortie('Dim x\nx = InputBox("Nom ?")')).toBe(
      "Erreur d'exécution 5 (ligne 3) : InputBox n'est pas disponible ici : mets la valeur dans une variable",
    );
  });
});

describe("VBA : Collection et Dictionary", () => {
  it("Collection : Add, Count, Item par position ou par clé", () => {
    expect(
      sortie(
        'Dim c As New Collection\nc.Add "a"\nc.Add "b", "cle"\nDebug.Print c.Count; c(1); c("cle")',
      ),
    ).toBe(" 2 ab\n");
  });

  it("Collection : une clé en double est refusée", () => {
    expect(sortie('Dim c As New Collection\nc.Add 1, "x"\nc.Add 2, "x"')).toBe(
      "Erreur d'exécution 457 (ligne 4) : Cette clé est déjà associée à un élément de cette collection",
    );
  });

  it("Dictionary : compter des occurrences", () => {
    const code = [
      "Dim d As Object, mot",
      'Set d = CreateObject("Scripting.Dictionary")',
      'For Each mot In Split("pomme poire pomme")',
      "  d(mot) = d(mot) + 1",
      "Next",
      "For Each mot In d.Keys",
      '  Debug.Print mot & " : " & d(mot)',
      "Next",
      'Debug.Print d.Exists("kiwi"); d.Count',
    ].join("\n");
    expect(sortie(code)).toBe("pomme : 2\npoire : 1\nFaux 2 \n");
  });

  it("Set est obligatoire pour un objet", () => {
    expect(sortie("Dim c As Collection\nc = New Collection")).toBe(
      "Erreur d'exécution 91 (ligne 3) : Variable objet ou variable de bloc With non définie",
    );
    expect(sortie("Dim x\nSet x = 5")).toBe("Erreur d'exécution 424 (ligne 3) : Objet requis");
  });

  it("Is Nothing", () => {
    expect(
      sortie(
        'Dim r As Range\nDebug.Print r Is Nothing\nSet r = Range("A1")\nDebug.Print r Is Nothing',
      ),
    ).toBe("Vrai\nFaux\n");
  });
});

describe("VBA : le classeur Excel", () => {
  it("écrit dans les cellules avec Range et Cells", () => {
    expect(
      grille(
        'Range("A1").Value = "Nom"\nCells(1, 2) = "Âge"\nCells(2, "A").Value = "Aiko"\nRange("B2") = 30',
      ),
    ).toEqual([
      ["Nom", "Âge"],
      ["Aiko", "30"],
    ]);
  });

  it("lit les cellules : un nombre reste un nombre", () => {
    expect(
      sortie(
        'Range("A1") = 2\nRange("A2") = "3"\nDebug.Print Range("A1") + Range("A2"); IsNumeric(Range("A2"))',
      ),
    ).toBe(" 5 Vrai\n");
  });

  it("remplit une plage d'un coup, et la relit dans un tableau", () => {
    expect(grille('Range("A1:C1").Value = Array("x", "y", "z")\nRange("A2:B3").Value = 0')).toEqual(
      [
        ["x", "y", "z"],
        ["0", "0", ""],
        ["0", "0", ""],
      ],
    );
    expect(
      sortie(
        'Range("A1:B2").Value = 5\nDim t\nt = Range("A1:B2").Value\nDebug.Print UBound(t, 1); UBound(t, 2); t(2, 2)',
      ),
    ).toBe(" 2  2  5 \n");
  });

  it("trouve la dernière ligne avec End(xlUp)", () => {
    const code =
      'Dim i\nFor i = 1 To 5\nCells(i, 1) = i\nNext\nDebug.Print Cells(Rows.Count, 1).End(xlUp).Row; Range("A1").End(xlDown).Row; Range("A1").End(xlToRight).Column';
    expect(sortie(code)).toBe(" 5  5  16384 \n");
  });

  it("Offset, Resize, Address, Count, CurrentRegion", () => {
    const code = [
      'Range("B2:C3").Value = 1',
      'Debug.Print Range("A1").Offset(1, 2).Address',
      'Debug.Print Range("A1").Resize(2, 3).Address',
      'Debug.Print Range("A1:C4").Count; Range("A1:C4").Rows.Count; Range("A1:C4").Columns.Count',
      'Debug.Print Range("B2").CurrentRegion.Address(False, False)',
    ].join("\n");
    expect(sortie(code)).toBe("$C$2\n$A$1:$C$2\n 12  4  3 \nB2:C3\n");
  });

  it("parcourt une plage avec For Each", () => {
    expect(
      sortie(
        'Range("A1:A3").Value = 2\nDim c, total\nFor Each c In Range("A1:A3")\ntotal = total + c.Value\nNext\nDebug.Print total',
      ),
    ).toBe(" 6 \n");
  });

  it("gère plusieurs feuilles", () => {
    const resultat = main(
      'Worksheets.Add.Name = "Ventes"\nWorksheets("Ventes").Range("A1") = "ici"\nSheets("Feuil1").Range("A1") = "là"\nDebug.Print Worksheets.Count; ActiveSheet.Name',
    );
    expect(resultat.sortie).toBe(" 2 Ventes\n");
    expect(resultat.feuilles.map((feuille) => feuille.nom)).toEqual(["Ventes", "Feuil1"]);
  });

  it("refuse une feuille inconnue", () => {
    expect(sortie('Worksheets("Budget").Range("A1") = 1')).toBe(
      "Erreur d'exécution 9 (ligne 2) : L'indice n'appartient pas à la sélection : aucune feuille « Budget »",
    );
  });

  it("supprime des lignes en décalant les suivantes", () => {
    expect(
      grille(
        'Dim i\nFor i = 1 To 4\nCells(i, 1) = i\nNext\nRows(2).Delete\nRange("A1").EntireRow.Insert',
      ),
    ).toEqual([[""], ["1"], ["3"], ["4"]]);
  });

  it("efface le contenu ou le format", () => {
    expect(main('Range("A1:B1") = 1\nRange("A1").ClearContents').feuilles[0]?.lignes).toEqual([
      [null, { texte: "1", gras: false, italique: false, nombre: true }],
    ]);
  });

  it("affiche le format des nombres (NumberFormat) et la police", () => {
    const resultat = main(
      'Range("A1") = 1234.5\nRange("A1").NumberFormat = "#,##0.00 €"\nRange("A1").Font.Bold = True\nDebug.Print Range("A1").Text',
    );
    expect(resultat.sortie).toBe("1 234,50 €\n");
    expect(resultat.feuilles[0]?.lignes[0]?.[0]).toEqual({
      texte: "1 234,50 €",
      gras: true,
      italique: false,
      nombre: true,
    });
  });

  it("WorksheetFunction : Sum, Average, Max, CountIf, VLookup", () => {
    const code = [
      'Range("A1:A3").Value = Application.WorksheetFunction.Transpose(Array("Café", "Thé", "Lait"))',
      'Range("B1") = 2: Range("B2") = 4: Range("B3") = 9',
      "With WorksheetFunction",
      '  Debug.Print .Sum(Range("B1:B3")); .Average(Range("B1:B3")); .Max(Range("B1:B3")); .CountIf(Range("B1:B3"), ">3")',
      '  Debug.Print .VLookup("Thé", Range("A1:B3"), 2, False)',
      "End With",
    ].join("\n");
    expect(sortie(code)).toBe(" 15  5  9  2 \n 4 \n");
  });

  it("VLookup sans résultat lève l'erreur 1004", () => {
    expect(sortie('Debug.Print WorksheetFunction.VLookup("x", Range("A1:B2"), 2, False)')).toBe(
      "Erreur d'exécution 1004 (ligne 2) : Impossible de lire la propriété VLookup de la classe WorksheetFunction",
    );
  });

  it("calcule les formules Excel (voir formules.test.ts)", () => {
    expect(
      sortie(
        'Range("B1:B3").Value = 2\nRange("A1").Formula = "=SUM(B1:B3)"\nDebug.Print Range("A1").Value',
      ),
    ).toBe(" 6 \n");
  });

  it("Copy vers une destination", () => {
    expect(grille('Range("A1") = "x"\nRange("A1").Copy Destination:=Range("C2")')).toEqual([
      ["x", "", ""],
      ["", "", "x"],
    ]);
  });

  it("Find renvoie la cellule trouvée, ou Nothing", () => {
    expect(
      sortie(
        'Range("B3") = "Renard"\nDebug.Print Range("A1:C5").Find("renard").Address\nDebug.Print Range("A1:C5").Find("loup") Is Nothing',
      ),
    ).toBe("$B$3\nVrai\n");
  });

  it("n'affiche que les feuilles non vides, à partir de A1", () => {
    expect(main('Debug.Print "rien"').feuilles).toEqual([]);
    expect(grille('Range("B2") = "x"')).toEqual([
      ["", ""],
      ["", "x"],
    ]);
  });
});

describe("VBA : erreurs de syntaxe", () => {
  it.each([
    ["Sub Main()\nIf x Then\nEnd Sub", "Erreur de compilation (ligne 3) : « End If » attendu"],
    [
      "Sub Main()\nFor i = 1 To 3\nEnd Sub",
      "Erreur de compilation (ligne 3) : « Next » attendu pour fermer la boucle For",
    ],
    [
      'Sub Main()\nDebug.Print "abc\nEnd Sub',
      'Erreur de compilation (ligne 2) : Chaîne de caractères non terminée : il manque un "',
    ],
    [
      "Sub Main()\nDim x As Entier\nEnd Sub",
      "Erreur de compilation (ligne 2) : Type non défini par l'utilisateur : « Entier »",
    ],
    ["Sub Main()\nx = \nEnd Sub", "Erreur de compilation (ligne 2) : Expression attendue"],
    ["Sub Main()\nDebug.Print 1", "Erreur de compilation (ligne 2) : « End Sub » attendu"],
  ])("%s", (code, erreur) => {
    expect(executer(code).erreur).toBe(erreur);
  });
});

describe("Format", () => {
  it.each([
    [3.14159, "0.00", "3,14"],
    [-5, "0.00", "-5,00"],
    [1234567, "#,##0", "1 234 567"],
    [0.5, "0%", "50%"],
    [42, '"Total : "0', "Total : 42"],
    [0, '0.00;-0.00;"zéro"', "zéro"],
    [-3, "0;(0)", "(3)"],
    [12345.678, "0.00E+00", "1,23E+04"],
  ])("Format(%s, %s) = %s", (valeur, motif, attendu) => {
    expect(formater(valeur, motif)).toBe(attendu);
  });
});
