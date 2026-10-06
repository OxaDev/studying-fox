/** Coloration et suggestions de l'éditeur pour le VBA (CodeMirror). */
import { type Completion, completeFromList } from "@codemirror/autocomplete";
import { LanguageSupport, StreamLanguage, type StreamParser } from "@codemirror/language";

const MOTS_CLES = [
  "And",
  "As",
  "Boolean",
  "ByRef",
  "ByVal",
  "Call",
  "Case",
  "Const",
  "Currency",
  "Date",
  "Dim",
  "Do",
  "Double",
  "Each",
  "Else",
  "ElseIf",
  "End",
  "Erase",
  "Error",
  "Exit",
  "Explicit",
  "For",
  "Function",
  "GoTo",
  "If",
  "In",
  "Integer",
  "Is",
  "Like",
  "Long",
  "Loop",
  "Mod",
  "New",
  "Next",
  "Not",
  "Nothing",
  "Object",
  "On",
  "Option",
  "Optional",
  "Or",
  "ParamArray",
  "Preserve",
  "Private",
  "Public",
  "ReDim",
  "Resume",
  "Select",
  "Set",
  "Single",
  "Static",
  "Step",
  "String",
  "Sub",
  "Then",
  "To",
  "Until",
  "Variant",
  "Wend",
  "While",
  "With",
  "Xor",
];

const FONCTIONS = [
  "Abs",
  "Array",
  "Asc",
  "CBool",
  "CDate",
  "CDbl",
  "Chr",
  "CInt",
  "CLng",
  "CStr",
  "CreateObject",
  "Date",
  "DateAdd",
  "DateDiff",
  "DateSerial",
  "Day",
  "Format",
  "IIf",
  "InStr",
  "InStrRev",
  "Int",
  "IsDate",
  "IsEmpty",
  "IsNumeric",
  "Join",
  "LBound",
  "LCase",
  "Left",
  "Len",
  "LTrim",
  "Mid",
  "Month",
  "MsgBox",
  "Now",
  "Replace",
  "Right",
  "Round",
  "RTrim",
  "Split",
  "Sqr",
  "Trim",
  "TypeName",
  "UBound",
  "UCase",
  "Val",
  "Weekday",
  "Year",
];

const OBJETS = [
  "ActiveCell",
  "ActiveSheet",
  "ActiveWorkbook",
  "Application",
  "Cells",
  "Collection",
  "Columns",
  "Debug",
  "Dictionary",
  "Err",
  "Range",
  "Rows",
  "Selection",
  "Sheets",
  "ThisWorkbook",
  "Worksheet",
  "WorksheetFunction",
  "Worksheets",
];

const PROPRIETES = [
  "Address",
  "Bold",
  "ClearContents",
  "Color",
  "Column",
  "Count",
  "CurrentRegion",
  "Delete",
  "End",
  "EntireRow",
  "Font",
  "Interior",
  "Name",
  "NumberFormat",
  "Offset",
  "Print",
  "Resize",
  "Row",
  "Text",
  "UsedRange",
  "Value",
];

const CONSTANTES = [
  "False",
  "True",
  "vbCrLf",
  "vbNewLine",
  "vbTab",
  "xlDown",
  "xlToLeft",
  "xlToRight",
  "xlUp",
];

const MOTS = new Set(MOTS_CLES.map((mot) => mot.toLowerCase()));
const BOOLEENS = new Set(["true", "false", "nothing", "empty", "null"]);

const suggestions: Completion[] = [
  ...MOTS_CLES.map((label) => ({ label, type: "keyword" })),
  ...FONCTIONS.map((label) => ({ label, type: "function" })),
  ...OBJETS.map((label) => ({ label, type: "class" })),
  ...PROPRIETES.map((label) => ({ label, type: "property" })),
  ...CONSTANTES.map((label) => ({ label, type: "constant" })),
];

const analyseur: StreamParser<Record<string, never>> = {
  name: "vba",
  startState: () => ({}),
  token(flux) {
    if (flux.eatSpace()) return null;
    if (flux.match("'") || flux.match(/^rem\b/i)) {
      flux.skipToEnd();
      return "comment";
    }
    if (flux.match(/^"([^"]|"")*"?/)) return "string";
    if (flux.match(/^#[\d/:\- ]+#/)) return "number";
    if (flux.match(/^(&H[0-9a-f]+|\d+\.?\d*(e[+-]?\d+)?|\.\d+)/i)) return "number";
    const mot = flux.match(/^[A-Za-z\u00C0-\u024F][\w\u00C0-\u024F]*[$%&!#@]?/);
    if (Array.isArray(mot)) {
      const nom = mot[0].toLowerCase();
      if (BOOLEENS.has(nom)) return "bool";
      if (MOTS.has(nom)) return "keyword";
      return null;
    }
    flux.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "'" },
    autocomplete: completeFromList(suggestions),
  },
};

const langageVba = StreamLanguage.define(analyseur);

export function vba(): LanguageSupport {
  return new LanguageSupport(langageVba);
}
