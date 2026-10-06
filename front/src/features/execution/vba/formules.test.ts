import { describe, expect, it } from "vitest";

import { analyserFormule, ecrireFormule } from "./formules-syntaxe";
import { executerVba } from "./interpreteur";

/** Exécute des instructions dans Sub Main() et renvoie la sortie, ou l'erreur. */
function sortie(corps: string): string {
  let texte = "";
  const resultat = executerVba(`Sub Main()\n${corps}\nEnd Sub`, {
    ecrire: (t) => {
      texte += t;
    },
    maintenant: () => new Date(2026, 9, 6, 14, 30, 5),
  });
  return resultat.erreur ? texte + resultat.erreur : texte;
}

/** Écrit une formule en A1 (après avoir préparé la feuille) et affiche le texte de la cellule. */
function calcul(formule: string, preparation = ""): string {
  const echappee = formule.replace(/"/g, '""');
  return sortie(
    `${preparation}\nRange("A1").Formula = "${echappee}"\nDebug.Print Range("A1").Text`,
  ).trimEnd();
}

const DONNEES = [
  'Range("B1:B4").Value = Application.WorksheetFunction.Transpose(Array(10, 20, 30, 40))',
  'Range("C1:C4").Value = Application.WorksheetFunction.Transpose(Array("Paris", "Lyon", "Paris", "Lille"))',
].join("\n");

describe("Formules : lecture et écriture", () => {
  it.each([
    ["=A1+B2*2", "a1"],
    ["=SUM($A$1:B3,2.5)", "a1"],
    ['=IF(A1>=10,"oui","non")', "a1"],
    ["=Feuil2!A1+'Mes ventes'!B2", "a1"],
    ["=SUM(A:A)+SUM(1:1)", "a1"],
    ["=-A1^2%", "a1"],
    ["=SOMME(A1;2,5)", "local"],
    ["=SIERREUR(RECHERCHEV(A1;B:C;2;FAUX);#N/A)", "local"],
    ["=R1C1+R[-1]C[2]+RC", "r1c1"],
  ] as const)("relit %s à l'identique (%s)", (formule, syntaxe) => {
    const hote = { ligne: 5, colonne: 5 };
    expect(ecrireFormule(analyserFormule(formule.slice(1), syntaxe, hote), syntaxe, hote)).toBe(
      formule,
    );
  });

  it("passe d'une syntaxe à l'autre", () => {
    const arbre = analyserFormule("SOMME($A$1:B2;0,5)", "local", { ligne: 3, colonne: 3 });
    expect(ecrireFormule(arbre, "a1", { ligne: 3, colonne: 3 })).toBe("=SUM($A$1:B2,0.5)");
    expect(ecrireFormule(arbre, "r1c1", { ligne: 3, colonne: 3 })).toBe(
      "=SUM(R1C1:R[-1]C[-1],0.5)",
    );
  });

  it("Formula, FormulaLocal et FormulaR1C1 décrivent la même formule", () => {
    expect(
      sortie(
        'Range("C3").FormulaLocal = "=MOYENNE(A1:B2)"\nDebug.Print Range("C3").Formula; " "; Range("C3").FormulaLocal; " "; Range("C3").FormulaR1C1',
      ),
    ).toBe("=AVERAGE(A1:B2) =MOYENNE(A1:B2) =AVERAGE(R[-2]C[-2]:R[-1]C[-1])\n");
  });

  it("Value avec un texte qui commence par = écrit aussi une formule", () => {
    expect(
      sortie(
        'Range("B1") = 4\nRange("A1").Value = "=B1*2"\nDebug.Print Range("A1").Value; Range("A1").HasFormula',
      ),
    ).toBe(" 8 Vrai\n");
  });

  it("une formule mal écrite est refusée avec l'erreur 1004", () => {
    expect(sortie('Range("A1").Formula = "=SUM(A1"')).toBe(
      "Erreur d'exécution 1004 (ligne 2) : Formule incorrecte : il manque une parenthèse fermante après SUM",
    );
  });

  it("explique la différence entre Formula et FormulaLocal", () => {
    expect(sortie('Range("A1").Formula = "=SOMME(B1;B2)"')).toMatch(
      /Formule incorrecte : avec Formula, écris la formule en anglais.*En français, utilise FormulaLocal$/,
    );
  });
});

describe("Formules : calcul", () => {
  it.each([
    ["=1+2*3", "7"],
    ["=(1+2)*3", "9"],
    ["=-2^2", "4"],
    ["=2^3^2", "64"],
    ["=50%", "0,5"],
    ["=10/4", "2,5"],
    ['="Bon"&"jour"', "Bonjour"],
    ["=1&2", "12"],
    ['="10"+5', "15"],
    ["=TRUE+1", "2"],
    ['="abc"="ABC"', "VRAI"],
    ['=1<"a"', "VRAI"],
    ["=MOD(-7,3)", "2"],
  ])("%s vaut %s", (formule, attendu) => {
    expect(calcul(formule)).toBe(attendu);
  });

  it.each([
    ["=SUM(B1:B4)", "100"],
    ["=SUM(B:B)", "100"],
    ["=AVERAGE(B1:B4)", "25"],
    ["=MAX(B1:B4)-MIN(B1:B4)", "30"],
    ["=COUNT(B1:C4)", "4"],
    ["=COUNTA(C:C)", "4"],
    ['=COUNTIF(C1:C4,"Paris")', "2"],
    ['=SUMIF(C1:C4,"Paris",B1:B4)', "40"],
    ['=COUNTIF(B1:B4,">15")', "3"],
    ["=VLOOKUP(30,B1:C4,2,FALSE)", "Paris"],
    ['=MATCH("Lille",C1:C4,0)', "4"],
    ["=INDEX(B1:C4,2,2)", "Lyon"],
    ["=ROUND(2.567,2)", "2,57"],
    ['=IF(SUM(B1:B4)>50,"Objectif atteint","En cours")', "Objectif atteint"],
    ["=AND(B1>5,B2>5)", "VRAI"],
    ["=OR(B1>50,B2>50)", "FAUX"],
    ['=CONCATENATE(C1," : ",B1)', "Paris : 10"],
    ["=LEFT(C2,2)&UPPER(RIGHT(C2,2))", "LyON"],
    ["=LEN(C4)", "5"],
    ['=TEXT(B4/3,"0.00")', "13,33"],
  ])("%s vaut %s", (formule, attendu) => {
    expect(calcul(formule, DONNEES)).toBe(attendu);
  });

  it("les noms français marchent avec FormulaLocal", () => {
    expect(
      sortie(
        `${DONNEES}\nRange("A1").FormulaLocal = "=SI(NB.SI(C1:C4;""Paris"")>1;""plusieurs"";""un"")"\nDebug.Print Range("A1").Value`,
      ),
    ).toBe("plusieurs\n");
  });

  it("calcule les dates", () => {
    expect(calcul("=DATE(2026,3,15)")).toBe("15/03/2026");
    expect(calcul("=DATE(2026,3,15)+30")).toBe("14/04/2026");
    expect(calcul("=YEAR(TODAY())")).toBe("2026");
  });

  it("recalcule quand les données changent", () => {
    expect(
      sortie(
        'Range("B1") = 1\nRange("A1").Formula = "=B1*10"\nDebug.Print Range("A1").Value;\nRange("B1") = 5\nDebug.Print Range("A1").Value',
      ),
    ).toBe(" 10  50 \n");
  });

  it("enchaîne les formules qui dépendent les unes des autres", () => {
    expect(
      sortie(
        'Range("A1") = 2\nRange("A2").Formula = "=A1*3"\nRange("A3").Formula = "=A2+A1"\nDebug.Print Range("A3").Value',
      ),
    ).toBe(" 8 \n");
  });

  it("lit les autres feuilles", () => {
    expect(
      sortie(
        'Worksheets.Add.Name = "Tarifs"\nWorksheets("Tarifs").Range("A1") = 12\nWorksheets("Feuil1").Range("A1").Formula = "=Tarifs!A1*2"\nDebug.Print Worksheets("Feuil1").Range("A1").Value',
      ),
    ).toBe(" 24 \n");
  });

  it("une référence circulaire vaut 0, comme dans Excel", () => {
    expect(
      sortie(
        'Range("A1").Formula = "=B1+1"\nRange("B1").Formula = "=A1+1"\nDebug.Print Range("A1").Value; Range("B1").Value',
      ),
    ).toBe(" 0  0 \n");
  });
});

describe("Formules : recopie relative", () => {
  it("une formule donnée à une plage se décale ligne par ligne", () => {
    expect(
      sortie(
        'Range("A1:A3").Value = 2\nRange("B1:B3").Value = 5\nRange("C1:C3").Formula = "=A1*B1"\nRange("A3") = 4\nDebug.Print Range("C3").Formula; Range("C3").Value',
      ),
    ).toBe("=A3*B3 20 \n");
  });

  it("les références absolues ne bougent pas", () => {
    expect(sortie('Range("C1:C3").Formula = "=$A$1+A1"\nDebug.Print Range("C3").Formula')).toBe(
      "=$A$1+A3\n",
    );
  });

  it("Copy décale les références, et PasteSpecial colle les valeurs", () => {
    const code = [
      'Range("A1") = 1: Range("A2") = 2',
      'Range("B1").Formula = "=A1*100"',
      'Range("B1").Copy Destination:=Range("B2")',
      'Range("B2").Copy',
      'Range("D1").PasteSpecial',
      'Debug.Print Range("B2").Formula; Range("B2").Value; Range("D1").HasFormula; Range("D1").Value',
    ].join("\n");
    expect(sortie(code)).toBe("=A2*100 200 Faux 200 \n");
  });

  it("une référence qui sort de la feuille devient #REF!", () => {
    expect(
      sortie(
        'Range("B2").Formula = "=A1"\nRange("B2").Copy Destination:=Range("B1")\nDebug.Print Range("B1").Formula',
      ),
    ).toBe("=#REF!\n");
  });
});

describe("Formules : erreurs de cellule", () => {
  it.each([
    ["=1/0", "#DIV/0!"],
    ['="a"+1', "#VALUE!"],
    ["=FONCTIONINCONNUE(1)", "#NAME?"],
    ["=nomInconnu", "#NAME?"],
    ['=VLOOKUP("x",B1:C4,2,FALSE)', "#N/A"],
    ["=SQRT(-1)", "#NUM!"],
    ["=AVERAGE(D1:D3)", "#DIV/0!"],
    ["=NA()", "#N/A"],
  ])("%s vaut %s", (formule, attendu) => {
    expect(calcul(formule, DONNEES)).toBe(attendu);
  });

  it("une erreur se propage aux formules qui en dépendent", () => {
    expect(
      sortie(
        'Range("A1").Formula = "=1/0"\nRange("A2").Formula = "=A1+1"\nRange("A3").Formula = "=SUM(A1:A2)"\nDebug.Print Range("A2").Text; " "; Range("A3").Text',
      ),
    ).toBe("#DIV/0! #DIV/0!\n");
  });

  it("IFERROR, ISERROR et IFNA rattrapent les erreurs", () => {
    expect(calcul('=IFERROR(1/0,"impossible")')).toBe("impossible");
    expect(calcul("=ISERROR(1/0)")).toBe("VRAI");
    expect(calcul('=IFNA(VLOOKUP("x",B1:C4,2,FALSE),"absent")', DONNEES)).toBe("absent");
  });

  it("en VBA, une cellule en erreur est un Variant Error", () => {
    expect(
      sortie(
        'Range("A1").Formula = "=1/0"\nDebug.Print IsError(Range("A1").Value); TypeName(Range("A1").Value)\nDebug.Print Range("A1").Value',
      ),
    ).toBe("VraiError\nErreur 2007\n");
    expect(sortie('Range("A1").Formula = "=1/0"\nDebug.Print "x" & Range("A1").Value')).toBe(
      "Erreur d'exécution 13 (ligne 3) : Incompatibilité de type",
    );
  });

  it("WorksheetFunction échoue sur une plage qui contient une erreur", () => {
    expect(
      sortie('Range("A1").Formula = "=1/0"\nDebug.Print WorksheetFunction.Sum(Range("A1:A2"))'),
    ).toBe(
      "Erreur d'exécution 1004 (ligne 3) : Impossible de lire la propriété Sum de la classe WorksheetFunction",
    );
  });
});

describe("Formules : la feuille affichée", () => {
  it("montre le résultat des formules, au format de la cellule", () => {
    const resultat = executerVba(
      'Sub Main()\nRange("A1") = 1234.5\nRange("A2").Formula = "=A1*2"\nRange("A2").NumberFormat = "#,##0.00 €"\nEnd Sub',
      { ecrire: () => undefined },
    );
    expect(resultat.feuilles[0]?.lignes[1]?.[0]).toEqual({
      texte: "2 469,00 €",
      gras: false,
      italique: false,
      nombre: true,
    });
  });
});
