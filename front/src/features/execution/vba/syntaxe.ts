/** Analyse syntaxique : transforme les jetons en arbre (module, procédures, instructions). */
import { decouper, type Jeton } from "./lexique";
import { ErreurCompilation, RIEN, type Valeur } from "./valeurs";

export type Expr =
  | { k: "litteral"; valeur: Valeur }
  | { k: "nom"; nom: string; texte: string; ligne: number }
  /** `objet` vaut null pour `.Value` dans un bloc With. */
  | { k: "membre"; objet: Expr | null; nom: string; texte: string }
  /** Appel de fonction, ou indice de tableau : VBA ne les distingue pas à l'écriture. */
  | { k: "appel"; cible: Expr; args: Arg[] }
  | { k: "binaire"; op: string; gauche: Expr; droite: Expr }
  | { k: "unaire"; op: string; expr: Expr }
  | { k: "nouveau"; classe: string }
  /** Expression entre parenthèses : passée par valeur, même à un paramètre ByRef. */
  | { k: "paren"; expr: Expr };

/** `expr` vaut null pour un argument omis : `MsgBox "x", , "Titre"`. */
export interface Arg {
  nom: string | null;
  expr: Expr | null;
}

export interface Borne {
  bas: Expr | null;
  haut: Expr;
}

export interface DeclVar {
  nom: string;
  texte: string;
  type: string;
  /** `As New Collection` : l'objet est créé avec la variable. */
  nouveau: boolean;
  /** null : pas un tableau ; [] : tableau dynamique, à dimensionner avec ReDim. */
  bornes: Borne[] | null;
  ligne: number;
}

export type TestCas =
  | { k: "egal"; expr: Expr }
  | { k: "plage"; de: Expr; a: Expr }
  | { k: "comparaison"; op: string; expr: Expr };

export interface ElementPrint {
  expr: Expr | null;
  separateur: ";" | "," | null;
}

export type Instr =
  | { k: "dim"; ligne: number; vars: DeclVar[] }
  | { k: "const"; ligne: number; nom: string; type: string; expr: Expr }
  | {
      k: "redim";
      ligne: number;
      preserve: boolean;
      nom: string;
      bornes: Borne[];
      type: string | null;
    }
  | { k: "affecter"; ligne: number; cible: Expr; expr: Expr; set: boolean }
  | { k: "appel"; ligne: number; cible: Expr; args: Arg[] }
  | { k: "print"; ligne: number; elements: ElementPrint[] }
  | { k: "si"; ligne: number; branches: { cond: Expr; corps: Instr[] }[]; sinon: Instr[] }
  | {
      k: "selon";
      ligne: number;
      expr: Expr;
      cas: { tests: TestCas[]; corps: Instr[] }[];
      sinon: Instr[] | null;
    }
  | {
      k: "pour";
      ligne: number;
      variable: Expr;
      debut: Expr;
      fin: Expr;
      pas: Expr | null;
      corps: Instr[];
    }
  | { k: "pourChaque"; ligne: number; variable: Expr; collection: Expr; corps: Instr[] }
  | {
      k: "faire";
      ligne: number;
      /** Condition testée avant (Do While) ou après (Loop While) chaque tour. */
      avant: { jusqua: boolean; cond: Expr } | null;
      apres: { jusqua: boolean; cond: Expr } | null;
      corps: Instr[];
    }
  | { k: "avec"; ligne: number; objet: Expr; corps: Instr[] }
  | { k: "sortir"; ligne: number; quoi: "for" | "do" | "sub" | "function" }
  | { k: "surErreur"; ligne: number; mode: "suivante" | "zero" | { etiquette: string } }
  | { k: "reprendre"; ligne: number; mode: "suivante" | "ici" | { etiquette: string } }
  | { k: "allerA"; ligne: number; etiquette: string }
  | { k: "etiquette"; ligne: number; nom: string }
  | { k: "effacer"; ligne: number; noms: string[] }
  | { k: "fin"; ligne: number };

export interface Parametre {
  nom: string;
  texte: string;
  type: string | null;
  parValeur: boolean;
  optionnel: boolean;
  defaut: Expr | null;
  tableau: boolean;
  paramArray: boolean;
}

export interface Procedure {
  genre: "sub" | "function";
  nom: string;
  texte: string;
  params: Parametre[];
  typeRetour: string;
  corps: Instr[];
  ligne: number;
}

export interface Module {
  explicite: boolean;
  base: number;
  comparaisonTexte: boolean;
  variables: DeclVar[];
  constantes: { nom: string; type: string; expr: Expr; ligne: number }[];
  procedures: Map<string, Procedure>;
  /** Les procédures dans l'ordre du code : la première Sub est lancée. */
  ordre: Procedure[];
}

const PRIORITES: Record<string, number> = {
  imp: 1,
  eqv: 2,
  xor: 3,
  or: 4,
  and: 5,
  // 6 : Not
  "=": 7,
  "<>": 7,
  "<": 7,
  ">": 7,
  "<=": 7,
  ">=": 7,
  like: 7,
  is: 7,
  "&": 8,
  "+": 9,
  "-": 9,
  mod: 10,
  "\\": 11,
  "*": 12,
  "/": 12,
  // 13 : moins unaire
  "^": 14,
};

const FINS_DE_BLOC = new Set(["end", "else", "elseif", "next", "loop", "wend", "case"]);

const TYPES_CONNUS = new Set([
  "variant",
  "integer",
  "long",
  "longlong",
  "longptr",
  "byte",
  "single",
  "double",
  "currency",
  "decimal",
  "string",
  "boolean",
  "date",
  "object",
  "range",
  "worksheet",
  "workbook",
  "collection",
  "dictionary",
  "font",
  "interior",
  "application",
]);

export function analyser(source: string): Module {
  return new Analyseur(decouper(source)).module();
}

class Analyseur {
  private position = 0;
  /** Vrai dans un If écrit sur une seule ligne : la fin de ligne termine le If. */
  private surUneLigne = false;

  private readonly jetons: Jeton[];

  constructor(jetons: Jeton[]) {
    this.jetons = jetons;
  }

  // ——— Outils ———

  private get courant(): Jeton {
    return this.jetons[this.position] ?? { genre: "fin", ligne: 0 };
  }

  private regarder(decalage = 1): Jeton {
    return this.jetons[this.position + decalage] ?? { genre: "fin", ligne: 0 };
  }

  private get ligne(): number {
    return this.courant.ligne;
  }

  private avancer(): Jeton {
    const jeton = this.courant;
    this.position++;
    return jeton;
  }

  private erreur(message: string): never {
    throw new ErreurCompilation(message, this.ligne);
  }

  private estMot(nom: string, jeton: Jeton = this.courant): boolean {
    return jeton.genre === "mot" && jeton.nom === nom;
  }

  private estSymbole(texte: string, jeton: Jeton = this.courant): boolean {
    return jeton.genre === "symbole" && jeton.texte === texte;
  }

  private accepterMot(nom: string): boolean {
    if (!this.estMot(nom)) return false;
    this.position++;
    return true;
  }

  private accepterSymbole(texte: string): boolean {
    if (!this.estSymbole(texte)) return false;
    this.position++;
    return true;
  }

  private attendreMot(nom: string, message?: string): void {
    if (!this.accepterMot(nom)) this.erreur(message ?? `« ${nom} » attendu`);
  }

  private attendreSymbole(texte: string): void {
    if (!this.accepterSymbole(texte)) this.erreur(`« ${texte} » attendu`);
  }

  private identifiant(): { nom: string; texte: string } {
    const jeton = this.courant;
    if (jeton.genre !== "mot") this.erreur("Nom attendu");
    this.position++;
    return { nom: jeton.nom, texte: jeton.texte };
  }

  /** Fin d'instruction : fin de ligne ou deux-points. */
  private finInstruction(): boolean {
    const jeton = this.courant;
    return jeton.genre === "ligne" || jeton.genre === "fin" || this.estSymbole(":");
  }

  private terminerInstruction(): void {
    if (this.estMot("else")) return;
    if (!this.finInstruction()) this.erreur("Fin d'instruction attendue");
    if (this.courant.genre === "fin" || (this.surUneLigne && this.courant.genre === "ligne"))
      return;
    this.position++;
  }

  private accepterFinDeLigne(): void {
    if (this.courant.genre === "ligne") this.position++;
  }

  private sauterLignesVides(): void {
    while (this.courant.genre === "ligne" || this.estSymbole(":")) this.position++;
  }

  // ——— Module ———

  module(): Module {
    const module: Module = {
      explicite: false,
      base: 0,
      comparaisonTexte: false,
      variables: [],
      constantes: [],
      procedures: new Map(),
      ordre: [],
    };
    for (;;) {
      this.sauterLignesVides();
      if (this.courant.genre === "fin") return module;
      const ligne = this.ligne;

      if (this.accepterMot("option")) {
        if (this.accepterMot("explicit")) module.explicite = true;
        else if (this.accepterMot("base")) {
          const jeton = this.avancer();
          if (jeton.genre !== "nombre" || (jeton.valeur !== 0 && jeton.valeur !== 1)) {
            this.erreur("Option Base 0 ou Option Base 1 attendu");
          }
          module.base = jeton.valeur;
        } else if (this.accepterMot("compare")) {
          module.comparaisonTexte = this.accepterMot("text");
          if (!module.comparaisonTexte) this.attendreMot("binary");
        } else if (this.accepterMot("private")) {
          this.accepterMot("module");
        } else {
          this.erreur("Option inconnue");
        }
        this.terminerInstruction();
        continue;
      }
      // Lignes ajoutées par l'export d'un module (.bas) : on les ignore.
      if (this.estMot("attribute")) {
        while (!this.finInstruction()) this.position++;
        continue;
      }

      const portee =
        this.accepterMot("public") || this.accepterMot("private") || this.accepterMot("global");
      this.accepterMot("static");
      if (this.estMot("sub") || this.estMot("function")) {
        const procedure = this.procedure();
        if (module.procedures.has(procedure.nom)) {
          throw new ErreurCompilation(
            `Nom ambigu : « ${procedure.texte} » est déjà défini`,
            procedure.ligne,
          );
        }
        module.procedures.set(procedure.nom, procedure);
        module.ordre.push(procedure);
        continue;
      }
      if (this.accepterMot("const")) {
        for (const constante of this.constantes()) module.constantes.push({ ...constante, ligne });
        this.terminerInstruction();
        continue;
      }
      if (this.accepterMot("dim") || portee) {
        module.variables.push(...this.declarations());
        this.terminerInstruction();
        continue;
      }
      if (this.estMot("type") || this.estMot("enum")) {
        this.erreur("Les types personnalisés (Type, Enum) ne sont pas encore pris en charge");
      }
      if (this.estMot("declare")) this.erreur("Declare n'est pas disponible dans le navigateur");
      this.erreur(
        "Instruction incorrecte hors d'une procédure : place ton code entre « Sub Main() » et « End Sub »",
      );
    }
  }

  private procedure(): Procedure {
    const ligne = this.ligne;
    const genre = this.estMot("sub") ? "sub" : "function";
    this.position++;
    const { nom, texte } = this.identifiant();
    const params: Parametre[] = [];
    if (this.accepterSymbole("(")) {
      if (!this.accepterSymbole(")")) {
        do params.push(this.parametre());
        while (this.accepterSymbole(","));
        this.attendreSymbole(")");
      }
    }
    let typeRetour = "variant";
    if (this.accepterMot("as")) {
      typeRetour = this.nomDeType();
      if (this.accepterSymbole("(")) this.attendreSymbole(")");
    }
    this.terminerInstruction();
    const corps = this.bloc();
    if (!this.accepterMot("end"))
      this.erreur(`« End ${genre === "sub" ? "Sub" : "Function"} » attendu`);
    this.attendreMot(genre, `« End ${genre === "sub" ? "Sub" : "Function"} » attendu`);
    this.terminerInstruction();
    return { genre, nom, texte, params, typeRetour, corps, ligne };
  }

  private parametre(): Parametre {
    const optionnel = this.accepterMot("optional");
    let parValeur = false;
    if (this.accepterMot("byval")) parValeur = true;
    else this.accepterMot("byref");
    const paramArray = this.accepterMot("paramarray");
    const { nom, texte } = this.identifiant();
    let tableau = false;
    if (this.accepterSymbole("(")) {
      this.attendreSymbole(")");
      tableau = true;
    }
    let type: string | null = null;
    if (this.accepterMot("as")) type = this.nomDeType();
    let defaut: Expr | null = null;
    if (this.accepterSymbole("=")) {
      if (!optionnel) this.erreur("Seul un paramètre Optional peut avoir une valeur par défaut");
      defaut = this.expression();
    }
    return { nom, texte, type, parValeur, optionnel, defaut, tableau, paramArray };
  }

  private nomDeType(): string {
    const jeton = this.courant;
    const { nom } = this.identifiant();
    // Excel.Range, Scripting.Dictionary, VBA.Collection…
    if (this.accepterSymbole(".")) return this.nomDeType();
    if (nom === "longptr") return "long";
    if (nom === "decimal") return "double";
    if (!TYPES_CONNUS.has(nom)) {
      const texte = jeton.genre === "mot" ? jeton.texte : nom;
      this.erreur(`Type non défini par l'utilisateur : « ${texte} »`);
    }
    if (this.accepterSymbole("*")) this.avancer(); // String * 10
    return nom;
  }

  private declarations(): DeclVar[] {
    const vars: DeclVar[] = [];
    do {
      const ligne = this.ligne;
      this.accepterMot("withevents");
      const { nom, texte } = this.identifiant();
      let bornes: Borne[] | null = null;
      if (this.accepterSymbole("(")) {
        bornes = this.estSymbole(")") ? [] : this.bornes();
        this.attendreSymbole(")");
      }
      let type = "variant";
      let nouveau = false;
      if (this.accepterMot("as")) {
        nouveau = this.accepterMot("new");
        type = this.nomDeType();
      }
      vars.push({ nom, texte, type, nouveau, bornes, ligne });
    } while (this.accepterSymbole(","));
    return vars;
  }

  private bornes(): Borne[] {
    const bornes: Borne[] = [];
    do {
      const premiere = this.expression();
      if (this.accepterMot("to")) bornes.push({ bas: premiere, haut: this.expression() });
      else bornes.push({ bas: null, haut: premiere });
    } while (this.accepterSymbole(","));
    return bornes;
  }

  private constantes(): { nom: string; type: string; expr: Expr }[] {
    const constantes: { nom: string; type: string; expr: Expr }[] = [];
    do {
      const { nom } = this.identifiant();
      let type = "variant";
      if (this.accepterMot("as")) type = this.nomDeType();
      this.attendreSymbole("=");
      constantes.push({ nom, type, expr: this.expression() });
    } while (this.accepterSymbole(","));
    return constantes;
  }

  // ——— Instructions ———

  /** Lit des instructions jusqu'à un mot qui termine le bloc (End, Next, Loop, Else…). */
  private bloc(): Instr[] {
    const corps: Instr[] = [];
    for (;;) {
      this.sauterLignesVides();
      const jeton = this.courant;
      if (jeton.genre === "fin") return corps;
      if (jeton.genre === "mot" && FINS_DE_BLOC.has(jeton.nom)) {
        // « End » seul arrête le programme ; « End If », « End Sub »… terminent un bloc.
        const suivant = this.regarder();
        if (jeton.nom !== "end" || suivant.genre === "mot") return corps;
      }
      corps.push(...this.instruction());
    }
  }

  private instruction(): Instr[] {
    const ligne = this.ligne;
    const jeton = this.courant;

    // Étiquette : « Erreur: » en début d'instruction.
    if (
      jeton.genre === "mot" &&
      this.estSymbole(":", this.regarder()) &&
      !MOTS_RESERVES.has(jeton.nom)
    ) {
      this.position += 2;
      return [{ k: "etiquette", ligne, nom: jeton.nom }];
    }
    if (jeton.genre === "nombre" && this.regarder().genre !== "symbole") {
      this.position++;
      return [{ k: "etiquette", ligne, nom: String(jeton.valeur) }];
    }

    if (jeton.genre === "mot") {
      switch (jeton.nom) {
        case "dim":
        case "static":
          this.position++;
          return this.fin([{ k: "dim", ligne, vars: this.declarations() }]);
        case "const":
          this.position++;
          return this.fin(this.constantes().map((c) => ({ k: "const" as const, ligne, ...c })));
        case "redim":
          return this.fin(this.redim());
        case "set": {
          this.position++;
          const cible = this.postfixe();
          this.attendreSymbole("=");
          return this.fin([{ k: "affecter", ligne, cible, expr: this.expression(), set: true }]);
        }
        case "let":
          this.position++;
          return this.affectationOuAppel(ligne);
        case "call": {
          this.position++;
          const cible = this.postfixe();
          if (cible.k === "appel")
            return this.fin([{ k: "appel", ligne, cible: cible.cible, args: cible.args }]);
          return this.fin([{ k: "appel", ligne, cible, args: [] }]);
        }
        case "if":
          return this.si();
        case "select":
          return [this.selon()];
        case "for":
          return [this.estMot("each", this.regarder()) ? this.pourChaque() : this.pour()];
        case "do":
          return [this.faire()];
        case "while":
          return [this.tantQue()];
        case "with":
          return [this.avec()];
        case "exit": {
          this.position++;
          const quoi = this.avancer();
          if (quoi.genre !== "mot" || !["for", "do", "sub", "function"].includes(quoi.nom)) {
            this.erreur("Exit For, Exit Do, Exit Sub ou Exit Function attendu");
          }
          return this.fin([
            { k: "sortir", ligne, quoi: quoi.nom as "for" | "do" | "sub" | "function" },
          ]);
        }
        case "on":
          return this.fin([this.surErreur()]);
        case "resume": {
          this.position++;
          if (this.accepterMot("next"))
            return this.fin([{ k: "reprendre", ligne, mode: "suivante" }]);
          if (this.finInstruction()) return this.fin([{ k: "reprendre", ligne, mode: "ici" }]);
          return this.fin([{ k: "reprendre", ligne, mode: { etiquette: this.etiquette() } }]);
        }
        case "goto":
          this.position++;
          return this.fin([{ k: "allerA", ligne, etiquette: this.etiquette() }]);
        case "erase": {
          this.position++;
          const noms: string[] = [];
          do noms.push(this.identifiant().nom);
          while (this.accepterSymbole(","));
          return this.fin([{ k: "effacer", ligne, noms }]);
        }
        case "end":
          this.position++;
          return this.fin([{ k: "fin", ligne }]);
        case "debug":
          if (this.estSymbole(".", this.regarder())) {
            const methode = this.regarder(2);
            if (this.estMot("print", methode)) {
              this.position += 3;
              return this.fin([{ k: "print", ligne, elements: this.elementsPrint() }]);
            }
            if (this.estMot("assert", methode)) {
              this.position += 3;
              const cond = this.expression();
              return this.fin([
                {
                  k: "appel",
                  ligne,
                  cible: { k: "nom", nom: "__assert", texte: "Debug.Assert", ligne },
                  args: [{ nom: null, expr: cond }],
                },
              ]);
            }
          }
          break;
        case "sub":
        case "function":
          this.erreur("« End Sub » ou « End Function » attendu avant une nouvelle procédure");
          break;
        case "gosub":
        case "return":
          this.erreur("GoSub n'est pas pris en charge");
          break;
        case "else":
        case "elseif":
          this.erreur("Else sans If");
          break;
      }
    }
    return this.affectationOuAppel(ligne);
  }

  private fin(instructions: Instr[]): Instr[] {
    this.terminerInstruction();
    return instructions;
  }

  private etiquette(): string {
    const jeton = this.avancer();
    if (jeton.genre === "mot") return jeton.nom;
    if (jeton.genre === "nombre") return String(jeton.valeur);
    return this.erreur("Étiquette attendue");
  }

  private affectationOuAppel(ligne: number): Instr[] {
    const cible = this.postfixe();
    if (this.accepterSymbole("=")) {
      return this.fin([{ k: "affecter", ligne, cible, expr: this.expression(), set: false }]);
    }
    if (this.finInstruction() || this.estMot("else")) {
      if (cible.k === "appel")
        return this.fin([{ k: "appel", ligne, cible: cible.cible, args: cible.args }]);
      if (cible.k === "litteral" || cible.k === "nouveau") this.erreur("Instruction incorrecte");
      return this.fin([{ k: "appel", ligne, cible, args: [] }]);
    }
    // Appel sans parenthèses : MsgBox "Bonjour", vbInformation
    // `MsgBox ("a") & "b"` : la parenthèse appartenait au premier argument.
    if (
      cible.k === "appel" &&
      cible.args.length === 1 &&
      cible.args[0]?.expr &&
      cible.args[0].nom === null
    ) {
      const premier: Expr = { k: "paren", expr: cible.args[0].expr };
      if (this.courant.genre === "symbole" && this.courant.texte in PRIORITES) {
        const expr = this.suiteBinaire(premier, 0);
        const args = [
          { nom: null, expr },
          ...(this.accepterSymbole(",") ? this.argumentsSansParentheses() : []),
        ];
        return this.fin([{ k: "appel", ligne, cible: cible.cible, args }]);
      }
      if (this.accepterSymbole(",")) {
        const args = [{ nom: null, expr: premier }, ...this.argumentsSansParentheses()];
        return this.fin([{ k: "appel", ligne, cible: cible.cible, args }]);
      }
    }
    return this.fin([{ k: "appel", ligne, cible, args: this.argumentsSansParentheses() }]);
  }

  private argumentsSansParentheses(): Arg[] {
    const args: Arg[] = [];
    do {
      if (this.finInstruction() || this.estSymbole(",") || this.estMot("else")) {
        args.push({ nom: null, expr: null });
        continue;
      }
      args.push(this.argument());
    } while (this.accepterSymbole(","));
    return args;
  }

  private argument(): Arg {
    if (this.courant.genre === "mot" && this.estSymbole(":=", this.regarder())) {
      const nom = this.identifiant().nom;
      this.position++;
      return { nom, expr: this.expression() };
    }
    return { nom: null, expr: this.expression() };
  }

  private elementsPrint(): ElementPrint[] {
    const elements: ElementPrint[] = [];
    while (!this.finInstruction()) {
      let expr: Expr | null = null;
      if (!this.estSymbole(";") && !this.estSymbole(",")) expr = this.expression();
      let separateur: ";" | "," | null = null;
      if (this.accepterSymbole(";")) separateur = ";";
      else if (this.accepterSymbole(",")) separateur = ",";
      elements.push({ expr, separateur });
      if (separateur === null) break;
    }
    return elements;
  }

  private redim(): Instr[] {
    const ligne = this.ligne;
    this.position++;
    const preserve = this.accepterMot("preserve");
    const instructions: Instr[] = [];
    do {
      const { nom } = this.identifiant();
      this.attendreSymbole("(");
      const bornes = this.bornes();
      this.attendreSymbole(")");
      let type: string | null = null;
      if (this.accepterMot("as")) type = this.nomDeType();
      instructions.push({ k: "redim", ligne, preserve, nom, bornes, type });
    } while (this.accepterSymbole(","));
    return instructions;
  }

  private si(): Instr[] {
    const ligne = this.ligne;
    this.position++;
    const cond = this.expression();
    this.attendreMot("then", "« Then » attendu après la condition du If");

    // If sur une seule ligne : If x > 0 Then y = 1 Else y = 2
    if (this.courant.genre !== "ligne" && !this.estSymbole(":")) {
      const alors = this.instructionsSurLaLigne();
      let sinon: Instr[] = [];
      if (this.accepterMot("else")) sinon = this.instructionsSurLaLigne();
      this.accepterFinDeLigne();
      return [{ k: "si", ligne, branches: [{ cond, corps: alors }], sinon }];
    }

    this.terminerInstruction();
    const branches = [{ cond, corps: this.bloc() }];
    let sinon: Instr[] = [];
    for (;;) {
      if (this.accepterMot("elseif")) {
        const condition = this.expression();
        this.attendreMot("then", "« Then » attendu après la condition du ElseIf");
        this.terminerInstruction();
        branches.push({ cond: condition, corps: this.bloc() });
        continue;
      }
      if (this.accepterMot("else")) {
        if (this.estMot("if")) this.erreur("Écris « ElseIf » en un seul mot");
        this.terminerInstruction();
        sinon = this.bloc();
        continue;
      }
      break;
    }
    if (!this.accepterMot("end") || !this.accepterMot("if")) this.erreur("« End If » attendu");
    this.terminerInstruction();
    return [{ k: "si", ligne, branches, sinon }];
  }

  private instructionsSurLaLigne(): Instr[] {
    const avant = this.surUneLigne;
    this.surUneLigne = true;
    const instructions: Instr[] = [];
    try {
      for (;;) {
        instructions.push(...this.instruction());
        if (this.courant.genre === "ligne" || this.courant.genre === "fin" || this.estMot("else")) {
          return instructions;
        }
      }
    } finally {
      this.surUneLigne = avant;
    }
  }

  private selon(): Instr {
    const ligne = this.ligne;
    this.position++;
    this.attendreMot("case", "« Select Case » attendu");
    const expr = this.expression();
    this.terminerInstruction();
    const cas: { tests: TestCas[]; corps: Instr[] }[] = [];
    let sinon: Instr[] | null = null;
    this.sauterLignesVides();
    while (this.accepterMot("case")) {
      if (this.accepterMot("else")) {
        this.terminerInstruction();
        sinon = this.bloc();
        continue;
      }
      const tests: TestCas[] = [];
      do tests.push(this.testCas());
      while (this.accepterSymbole(","));
      this.terminerInstruction();
      cas.push({ tests, corps: this.bloc() });
    }
    if (!this.accepterMot("end") || !this.accepterMot("select"))
      this.erreur("« End Select » attendu");
    this.terminerInstruction();
    return { k: "selon", ligne, expr, cas, sinon };
  }

  private testCas(): TestCas {
    if (this.accepterMot("is")) {
      const jeton = this.avancer();
      if (jeton.genre !== "symbole" || !["=", "<>", "<", ">", "<=", ">="].includes(jeton.texte)) {
        this.erreur("Opérateur de comparaison attendu après Case Is");
      }
      return { k: "comparaison", op: jeton.texte, expr: this.expression() };
    }
    const de = this.expression();
    if (this.accepterMot("to")) return { k: "plage", de, a: this.expression() };
    return { k: "egal", expr: de };
  }

  private pour(): Instr {
    const ligne = this.ligne;
    this.position++;
    const variable = this.postfixe();
    this.attendreSymbole("=");
    const debut = this.expression();
    this.attendreMot("to", "« To » attendu dans la boucle For");
    const fin = this.expression();
    const pas = this.accepterMot("step") ? this.expression() : null;
    this.terminerInstruction();
    const corps = this.bloc();
    this.finDeBouclePour();
    return { k: "pour", ligne, variable, debut, fin, pas, corps };
  }

  private finDeBouclePour(): void {
    if (!this.accepterMot("next")) this.erreur("« Next » attendu pour fermer la boucle For");
    // « Next i » : le nom est facultatif.
    if (this.courant.genre === "mot") this.position++;
    this.terminerInstruction();
  }

  private pourChaque(): Instr {
    const ligne = this.ligne;
    this.position += 2;
    const variable = this.postfixe();
    this.attendreMot("in", "« In » attendu dans For Each");
    const collection = this.expression();
    this.terminerInstruction();
    const corps = this.bloc();
    this.finDeBouclePour();
    return { k: "pourChaque", ligne, variable, collection, corps };
  }

  private conditionDeBoucle(): { jusqua: boolean; cond: Expr } | null {
    if (this.accepterMot("while")) return { jusqua: false, cond: this.expression() };
    if (this.accepterMot("until")) return { jusqua: true, cond: this.expression() };
    return null;
  }

  private faire(): Instr {
    const ligne = this.ligne;
    this.position++;
    const avant = this.conditionDeBoucle();
    this.terminerInstruction();
    const corps = this.bloc();
    if (!this.accepterMot("loop")) this.erreur("« Loop » attendu pour fermer la boucle Do");
    const apres = this.conditionDeBoucle();
    if (avant && apres) this.erreur("La condition se met après Do ou après Loop, pas les deux");
    this.terminerInstruction();
    return { k: "faire", ligne, avant, apres, corps };
  }

  private tantQue(): Instr {
    const ligne = this.ligne;
    this.position++;
    const cond = this.expression();
    this.terminerInstruction();
    const corps = this.bloc();
    if (!this.accepterMot("wend")) this.erreur("« Wend » attendu pour fermer la boucle While");
    this.terminerInstruction();
    return { k: "faire", ligne, avant: { jusqua: false, cond }, apres: null, corps };
  }

  private avec(): Instr {
    const ligne = this.ligne;
    this.position++;
    const objet = this.expression();
    this.terminerInstruction();
    const corps = this.bloc();
    if (!this.accepterMot("end") || !this.accepterMot("with")) this.erreur("« End With » attendu");
    this.terminerInstruction();
    return { k: "avec", ligne, objet, corps };
  }

  private surErreur(): Instr {
    const ligne = this.ligne;
    this.position++;
    this.attendreMot("error", "« On Error » attendu");
    if (this.accepterMot("resume")) {
      this.attendreMot("next", "« On Error Resume Next » attendu");
      return { k: "surErreur", ligne, mode: "suivante" };
    }
    this.attendreMot("goto", "« On Error GoTo » ou « On Error Resume Next » attendu");
    const jeton = this.courant;
    if (jeton.genre === "nombre" && jeton.valeur === 0) {
      this.position++;
      return { k: "surErreur", ligne, mode: "zero" };
    }
    return { k: "surErreur", ligne, mode: { etiquette: this.etiquette() } };
  }

  // ——— Expressions ———

  expression(): Expr {
    return this.suiteBinaire(this.unaire(), 0);
  }

  /** Analyse par priorité des opérateurs, à partir d'un opérande déjà lu. */
  private suiteBinaire(gaucheInitiale: Expr, prioriteMin: number): Expr {
    let gauche = gaucheInitiale;
    for (;;) {
      const op = this.operateur();
      const priorite = op === null ? undefined : PRIORITES[op];
      if (op === null || priorite === undefined || priorite <= prioriteMin) return gauche;
      this.position++;
      // ^ est associatif à gauche en VBA : 2 ^ 3 ^ 2 = 64.
      const droite = this.suiteBinaire(this.unaire(op === "^" ? 14 : priorite), priorite);
      gauche = { k: "binaire", op, gauche, droite };
    }
  }

  private operateur(): string | null {
    const jeton = this.courant;
    if (jeton.genre === "symbole" && jeton.texte in PRIORITES) return jeton.texte;
    if (jeton.genre === "mot" && jeton.nom in PRIORITES) return jeton.nom;
    return null;
  }

  private unaire(priorite = 0): Expr {
    if (this.accepterMot("not")) {
      // Not a = b se lit Not (a = b).
      return { k: "unaire", op: "not", expr: this.suiteBinaire(this.unaire(6), 6) };
    }
    if (this.accepterSymbole("-")) {
      // -2 ^ 2 = -4 : la puissance passe avant le signe.
      const operande = this.suiteBinaire(this.unaire(13), Math.max(priorite, 13));
      return { k: "unaire", op: "-", expr: operande };
    }
    if (this.accepterSymbole("+")) return this.unaire(priorite);
    return this.postfixe();
  }

  /** Une valeur suivie de ses accès : Worksheets("Ventes").Range("A1").Value */
  private postfixe(): Expr {
    let expr = this.primaire();
    for (;;) {
      if (this.estSymbole(".") && this.regarder().genre === "mot") {
        this.position++;
        const { nom, texte } = this.identifiant();
        expr = { k: "membre", objet: expr, nom, texte };
        continue;
      }
      if (this.estSymbole("!") && this.regarder().genre === "mot") {
        // dico!cle équivaut à dico("cle")
        this.position++;
        const { texte } = this.identifiant();
        expr = {
          k: "appel",
          cible: expr,
          args: [{ nom: null, expr: { k: "litteral", valeur: texte } }],
        };
        continue;
      }
      if (this.estSymbole("(") && expr.k !== "litteral" && expr.k !== "paren") {
        this.position++;
        expr = { k: "appel", cible: expr, args: this.argumentsEntreParentheses() };
        continue;
      }
      return expr;
    }
  }

  private argumentsEntreParentheses(): Arg[] {
    const args: Arg[] = [];
    if (this.accepterSymbole(")")) return args;
    do {
      if (this.estSymbole(",") || this.estSymbole(")")) args.push({ nom: null, expr: null });
      else args.push(this.argument());
    } while (this.accepterSymbole(","));
    this.attendreSymbole(")");
    return args;
  }

  private primaire(): Expr {
    const jeton = this.courant;
    switch (jeton.genre) {
      case "nombre":
      case "chaine":
      case "date":
        this.position++;
        return { k: "litteral", valeur: jeton.valeur };
      case "symbole":
        if (jeton.texte === "(") {
          this.position++;
          const expr = this.expression();
          this.attendreSymbole(")");
          return { k: "paren", expr };
        }
        if (jeton.texte === "." && this.regarder().genre === "mot") {
          this.position++;
          const { nom, texte } = this.identifiant();
          return { k: "membre", objet: null, nom, texte };
        }
        return this.erreur(`Expression attendue avant « ${jeton.texte} »`);
      case "mot":
        switch (jeton.nom) {
          case "true":
            this.position++;
            return { k: "litteral", valeur: true };
          case "false":
            this.position++;
            return { k: "litteral", valeur: false };
          case "nothing":
            this.position++;
            return { k: "litteral", valeur: RIEN };
          case "empty":
            this.position++;
            return { k: "litteral", valeur: undefined };
          case "null":
            this.position++;
            return { k: "litteral", valeur: null };
          case "new": {
            this.position++;
            const classe = this.nomDeType();
            return { k: "nouveau", classe };
          }
        }
        if (MOTS_RESERVES.has(jeton.nom))
          return this.erreur(`Expression attendue avant « ${jeton.texte} »`);
        this.position++;
        return { k: "nom", nom: jeton.nom, texte: jeton.texte, ligne: jeton.ligne };
      default:
        return this.erreur("Expression attendue");
    }
  }
}

/** Mots qui ne peuvent pas servir de nom de variable. */
const MOTS_RESERVES = new Set([
  "and",
  "as",
  "byref",
  "byval",
  "call",
  "case",
  "const",
  "dim",
  "do",
  "each",
  "else",
  "elseif",
  "end",
  "eqv",
  "exit",
  "for",
  "function",
  "goto",
  "if",
  "imp",
  "in",
  "is",
  "like",
  "loop",
  "mod",
  "next",
  "not",
  "on",
  "or",
  "redim",
  "select",
  "set",
  "step",
  "sub",
  "then",
  "to",
  "until",
  "wend",
  "while",
  "with",
  "xor",
]);
