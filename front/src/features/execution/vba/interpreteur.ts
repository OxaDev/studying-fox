/**
 * Interpréteur VBA (ADR 0026). Il exécute un module : la première procédure Sub sans
 * paramètre est lancée, sur un classeur Excel simulé.
 */
import type { FeuilleAffichee } from "../types";
import { Application, Classeur, CollectionVba, Dictionnaire, instantane } from "./classeur";
import { codeVarType, CONSTANTES, type Contexte, FONCTIONS, ObjetErr } from "./fonctions";
import { MoteurFormules } from "./formules";
import {
  analyser,
  type Arg,
  type Borne,
  type DeclVar,
  type Expr,
  type Instr,
  type Module,
  type Procedure,
  type TestCas,
} from "./syntaxe";
import {
  type Argument,
  convertir,
  DateVba,
  enBooleen,
  enEntier,
  enNombre,
  enTexte,
  ErreurCompilation,
  ErreurExcel,
  ErreurVba,
  formaterDate,
  formaterNombre,
  lireNombre,
  MANQUANT,
  Manquant,
  NOMS_TYPES,
  nomDuType,
  ObjetVba,
  Rien,
  simple,
  TableauVba,
  TYPES_OBJET,
  type Valeur,
  valeurInitiale,
} from "./valeurs";

/** Une variable : sa valeur et son type déclaré. */
class Case {
  valeur: Valeur;
  readonly type: string;
  /** Déclarée comme tableau (Dim t() ou Dim t(5)). */
  readonly tableau: boolean;
  /** Tableau de taille fixe : ni ReDim, ni affectation. */
  readonly fixe: boolean;
  readonly constante: boolean;

  constructor(valeur: Valeur, type: string, tableau = false, fixe = false, constante = false) {
    this.valeur = valeur;
    this.type = type;
    this.tableau = tableau;
    this.fixe = fixe;
    this.constante = constante;
  }
}

interface Cadre {
  procedure: Procedure | null;
  locales: Map<string, Case>;
  /** Objets des blocs With, du plus extérieur au plus intérieur. */
  avec: ObjetVba[];
  surErreur: "aucun" | "suivante" | { etiquette: string };
  /** Vrai pendant l'exécution du gestionnaire d'erreur (après On Error GoTo). */
  enGestion: boolean;
}

/**
 * Les sauts (Exit, GoTo, Resume, End) remontent les appels comme des exceptions.
 * Ce ne sont pas des erreurs VBA : seules les ErreurVba vont au gestionnaire On Error.
 */
class Signal extends Error {}

/** Exit For, Exit Do, Exit Sub, Exit Function. */
class Sortie extends Signal {
  readonly quoi: "for" | "do" | "sub" | "function";

  constructor(quoi: "for" | "do" | "sub" | "function") {
    super(`Exit ${quoi}`);
    this.quoi = quoi;
  }
}

/** GoTo : reprend à une étiquette de la procédure. */
class Saut extends Signal {
  readonly etiquette: string;
  readonly ligne: number;

  constructor(etiquette: string, ligne: number) {
    super(`GoTo ${etiquette}`);
    this.etiquette = etiquette;
    this.ligne = ligne;
  }
}

/** Resume, dans un gestionnaire d'erreur. */
class Reprise extends Signal {
  readonly mode: "suivante" | "ici" | { etiquette: string };

  constructor(mode: "suivante" | "ici" | { etiquette: string }) {
    super("Resume");
    this.mode = mode;
  }
}

/** L'instruction End : le programme s'arrête. */
class FinProgramme extends Signal {
  constructor() {
    super("End");
  }
}

const PROFONDEUR_MAX = 500;

export interface OptionsVba {
  /** Reçoit le texte affiché par Debug.Print et MsgBox. */
  ecrire: (texte: string) => void;
  maintenant?: () => Date;
  aleatoire?: () => number;
}

export interface ResultatVba {
  /** Message d'erreur, ou null si le programme s'est terminé normalement. */
  erreur: string | null;
  feuilles: FeuilleAffichee[];
}

/** Exécute un module VBA. Renvoie l'erreur éventuelle et l'état des feuilles. */
export function executerVba(code: string, options: OptionsVba): ResultatVba {
  const classeur = new Classeur();
  classeur.moteur = new MoteurFormules(classeur, options.maintenant ?? (() => new Date()));
  let erreur: string | null = null;
  try {
    const module = analyser(code);
    new Interpreteur(module, classeur, options).lancer();
  } catch (e) {
    if (e instanceof ErreurCompilation) {
      erreur = `Erreur de compilation (ligne ${String(e.ligne)}) : ${e.message}`;
    } else if (e instanceof ErreurVba) {
      const ligne = e.ligne === null ? "" : ` (ligne ${String(e.ligne)})`;
      erreur = `Erreur d'exécution ${String(e.numero)}${ligne} : ${e.message}`;
    } else if (e instanceof RangeError) {
      erreur =
        "Erreur d'exécution 28 : Espace pile insuffisant (une procédure s'appelle sans fin ?)";
    } else {
      throw e;
    }
  }
  return { erreur, feuilles: instantane(classeur) };
}

class Interpreteur {
  private readonly globales = new Map<string, Case>();
  private readonly ctx: Contexte;
  private readonly err = new ObjetErr();
  private profondeur = 0;
  /** Position dans la ligne de sortie en cours, pour les zones de Debug.Print « , ». */
  private colonne = 0;

  private readonly module: Module;
  private readonly options: OptionsVba;

  constructor(module: Module, classeur: Classeur, options: OptionsVba) {
    this.module = module;
    this.options = options;
    this.ctx = {
      afficher: (texte) => {
        if (this.colonne > 0) this.ecrire("\n");
        this.ecrire(texte + "\n");
      },
      classeur,
      application: new Application(classeur),
      err: this.err,
      base: module.base,
      comparaisonTexte: module.comparaisonTexte,
      aleatoire: options.aleatoire ?? Math.random,
      maintenant: options.maintenant ?? (() => new Date()),
    };
  }

  private ecrire(texte: string): void {
    if (texte === "") return;
    this.options.ecrire(texte);
    const derniereLigne = texte.lastIndexOf("\n");
    this.colonne =
      derniereLigne === -1 ? this.colonne + texte.length : texte.length - derniereLigne - 1;
  }

  lancer(): void {
    verifier(this.module);
    const cadre = this.cadreModule();
    for (const variable of this.module.variables) {
      if (this.globales.has(variable.nom)) {
        throw new ErreurCompilation(
          `Déclaration existante : « ${variable.texte} »`,
          variable.ligne,
        );
      }
      this.globales.set(variable.nom, this.nouvelleCase(variable, cadre));
    }
    for (const constante of this.module.constantes) {
      const valeur = convertir(simple(this.evaluer(constante.expr, cadre)), constante.type);
      this.globales.set(constante.nom, new Case(valeur, constante.type, false, false, true));
    }
    const principale = this.module.ordre.find(
      (p) => p.genre === "sub" && p.params.every((param) => param.optionnel || param.paramArray),
    );
    if (!principale) {
      throw new ErreurCompilation(
        "Aucune procédure à lancer : écris ton code entre « Sub Main() » et « End Sub »",
        1,
      );
    }
    try {
      this.appeler(principale, [], cadre, principale.ligne);
    } catch (e) {
      if (!(e instanceof FinProgramme)) throw e;
    }
    if (this.colonne > 0) this.ecrire("\n");
  }

  private cadreModule(): Cadre {
    return { procedure: null, locales: new Map(), avec: [], surErreur: "aucun", enGestion: false };
  }

  // ——— Variables ———

  private nouvelleCase(variable: DeclVar, cadre: Cadre): Case {
    if (variable.bornes === null) {
      const valeur = variable.nouveau
        ? creerObjet(variable.type, variable.ligne)
        : valeurInitiale(variable.type);
      return new Case(valeur, variable.type);
    }
    if (variable.bornes.length === 0)
      return new Case(new TableauVba([], variable.type), variable.type, true);
    return new Case(
      new TableauVba(this.bornes(variable.bornes, cadre), variable.type),
      variable.type,
      true,
      true,
    );
  }

  private bornes(bornes: Borne[], cadre: Cadre): [number, number][] {
    return bornes.map((borne) => {
      const bas = borne.bas ? enEntier(this.evaluer(borne.bas, cadre)) : this.module.base;
      const haut = enEntier(this.evaluer(borne.haut, cadre));
      if (haut < bas) throw new ErreurVba(9);
      return [bas, haut];
    });
  }

  private trouver(nom: string, cadre: Cadre): Case | undefined {
    return cadre.locales.get(nom) ?? this.globales.get(nom);
  }

  /** La variable `nom`, créée à la volée sans Option Explicit (elle est alors Variant). */
  private variable(nom: string, texte: string, cadre: Cadre, ligne: number): Case {
    const existante = this.trouver(nom, cadre);
    if (existante) return existante;
    if (this.module.procedures.has(nom) || nom in FONCTIONS || nom in CONSTANTES) {
      throw new ErreurCompilation(
        `Affectation impossible : « ${texte} » est une procédure ou une fonction`,
        ligne,
      );
    }
    if (this.module.explicite)
      throw new ErreurCompilation(`Variable non définie : « ${texte} »`, ligne);
    const nouvelle = new Case(undefined, "variant");
    cadre.locales.set(nom, nouvelle);
    return nouvelle;
  }

  private ecrireCase(variable: Case, valeur: Valeur, set: boolean, texte: string): void {
    if (variable.constante)
      throw new ErreurCompilation(`Affectation à la constante « ${texte} » impossible`, 0);
    if (TYPES_OBJET.has(variable.type)) {
      if (set) {
        variable.valeur = convertir(valeur, variable.type);
        return;
      }
      // Sans Set, on affecte la propriété par défaut de l'objet (Range → Value).
      if (!(variable.valeur instanceof ObjetVba)) throw new ErreurVba(91);
      variable.valeur.ecrire("", [], valeur);
      return;
    }
    if (set) {
      if (variable.type !== "variant" || variable.tableau) throw new ErreurVba(424);
      variable.valeur = valeur;
      return;
    }
    const v = valeur instanceof ObjetVba ? valeur.defaut() : valeur;
    if (v instanceof Rien) throw new ErreurVba(91);
    if (variable.tableau) {
      if (variable.fixe)
        throw new ErreurCompilation(`Affectation au tableau fixe « ${texte} » impossible`, 0);
      if (!(v instanceof TableauVba)) throw new ErreurVba(13);
      variable.valeur = v.copier();
      return;
    }
    variable.valeur = convertir(v, variable.type);
  }

  // ——— Procédures ———

  private appeler(procedure: Procedure, args: Arg[], appelant: Cadre, ligne: number): Valeur {
    if (this.profondeur >= PROFONDEUR_MAX) throw new ErreurVba(28);
    const locales = new Map<string, Case>();
    const recopies: (() => void)[] = [];
    const positionnels = args.filter((arg) => arg.nom === null);
    const nommes = new Map(
      args.filter((arg) => arg.nom !== null).map((arg) => [arg.nom ?? "", arg]),
    );
    const avecParamArray = procedure.params.some((p) => p.paramArray);
    if (positionnels.length > procedure.params.length && !avecParamArray) {
      throw new ErreurCompilation(`Trop d'arguments pour « ${procedure.texte} »`, ligne);
    }
    for (const nom of nommes.keys()) {
      if (!procedure.params.some((p) => p.nom === nom)) {
        throw new ErreurCompilation(`Argument nommé introuvable : « ${nom} »`, ligne);
      }
    }

    for (const [index, param] of procedure.params.entries()) {
      if (param.paramArray) {
        const reste = positionnels
          .slice(index)
          .map((arg) => (arg.expr ? this.evaluer(arg.expr, appelant) : undefined));
        locales.set(
          param.nom,
          new Case(new TableauVba([[0, reste.length - 1]], "variant", reste), "variant", true),
        );
        break;
      }
      const arg = nommes.get(param.nom) ?? positionnels[index];
      const type = param.type ?? "variant";
      if (!arg?.expr) {
        if (!param.optionnel) {
          throw new ErreurCompilation(`Argument non facultatif : « ${param.texte} »`, ligne);
        }
        let valeur: Valeur = param.defaut
          ? simple(this.evaluer(param.defaut, appelant))
          : type === "variant"
            ? MANQUANT
            : valeurInitiale(type);
        if (!(valeur instanceof Manquant)) valeur = convertir(valeur, type);
        locales.set(param.nom, new Case(valeur, type));
        continue;
      }
      if (!param.parValeur) {
        const reference = this.reference(arg.expr, appelant, ligne);
        if (reference) {
          const compatible =
            param.type === null ||
            param.type === "variant" ||
            reference.case.type === param.type ||
            (param.type === "object" && TYPES_OBJET.has(reference.case.type));
          if (!compatible) {
            throw new ErreurCompilation(
              `Type d'argument ByRef incompatible pour « ${param.texte} » : ` +
                `déclare la variable As ${NOMS_TYPES[param.type ?? ""] ?? param.type ?? ""}, ou ajoute ByVal au paramètre`,
              ligne,
            );
          }
          if (param.tableau && !(reference.case.valeur instanceof TableauVba))
            throw new ErreurVba(13);
          locales.set(param.nom, reference.case);
          if (reference.recopie) recopies.push(reference.recopie);
          continue;
        }
      }
      const valeur = this.evaluer(arg.expr, appelant);
      if (param.tableau) {
        if (!(valeur instanceof TableauVba)) throw new ErreurVba(13);
        locales.set(param.nom, new Case(valeur.copier(), type, true));
      } else if (
        TYPES_OBJET.has(type) ||
        (type === "variant" && (valeur instanceof ObjetVba || valeur instanceof Rien))
      ) {
        locales.set(param.nom, new Case(convertir(valeur, type), type));
      } else {
        locales.set(
          param.nom,
          new Case(convertir(valeur instanceof ObjetVba ? valeur.defaut() : valeur, type), type),
        );
      }
    }

    if (procedure.genre === "function") {
      locales.set(
        procedure.nom,
        new Case(valeurInitiale(procedure.typeRetour), procedure.typeRetour),
      );
    }
    const cadre: Cadre = { procedure, locales, avec: [], surErreur: "aucun", enGestion: false };
    this.declarerLocales(procedure.corps, cadre);

    this.profondeur++;
    try {
      this.executerCorps(procedure.corps, cadre, 0);
    } catch (e) {
      if (!(e instanceof Sortie) || (e.quoi !== "sub" && e.quoi !== "function")) throw e;
    } finally {
      this.profondeur--;
      for (const recopie of recopies) recopie();
    }
    if (cadre.surErreur !== "aucun") this.err.effacer();
    return procedure.genre === "function" ? locales.get(procedure.nom)?.valeur : undefined;
  }

  /** Ce qu'on passe à un paramètre ByRef : la variable elle-même, ou une case d'un tableau. */
  private reference(
    expr: Expr,
    cadre: Cadre,
    ligne: number,
  ): { case: Case; recopie?: () => void } | null {
    if (expr.k === "nom") {
      const existante = this.trouver(expr.nom, cadre);
      if (existante) return existante.constante ? null : { case: existante };
      if (this.module.procedures.has(expr.nom) || expr.nom in FONCTIONS || expr.nom in CONSTANTES)
        return null;
      return { case: this.variable(expr.nom, expr.texte, cadre, ligne) };
    }
    if (expr.k === "appel" && expr.cible.k === "nom") {
      const tableau = this.trouver(expr.cible.nom, cadre)?.valeur;
      if (tableau instanceof TableauVba) {
        const indices = expr.args.map((arg) => this.indice(arg, cadre));
        const temporaire = new Case(tableau.lire(indices), tableau.typeElement);
        return {
          case: temporaire,
          recopie: () => {
            tableau.ecrire(indices, temporaire.valeur);
          },
        };
      }
    }
    return null;
  }

  /** Les variables d'une procédure existent dès son début, où que soit leur Dim. */
  private declarerLocales(corps: Instr[], cadre: Cadre): void {
    for (const instr of corps) {
      switch (instr.k) {
        case "dim":
          for (const variable of instr.vars) {
            if (cadre.locales.has(variable.nom)) {
              throw new ErreurCompilation(
                `Déclaration existante dans la procédure : « ${variable.texte} »`,
                variable.ligne,
              );
            }
            cadre.locales.set(variable.nom, this.nouvelleCase(variable, cadre));
          }
          break;
        case "const": {
          const valeur = convertir(simple(this.evaluer(instr.expr, cadre)), instr.type);
          cadre.locales.set(instr.nom, new Case(valeur, instr.type, false, false, true));
          break;
        }
        default:
          for (const bloc of sousBlocs(instr)) this.declarerLocales(bloc, cadre);
      }
    }
  }

  /** Exécute le corps d'une procédure à partir d'une position, en suivant les GoTo. */
  private executerCorps(corps: Instr[], cadre: Cadre, debut: number): void {
    let position = debut;
    for (;;) {
      try {
        this.executerListe(corps, cadre, position);
        return;
      } catch (e) {
        if (!(e instanceof Saut)) throw e;
        position = positionEtiquette(corps, e.etiquette, e.ligne) + 1;
      }
    }
  }

  private executerListe(instructions: Instr[], cadre: Cadre, debut = 0): void {
    for (let i = debut; i < instructions.length; i++) {
      const instr = instructions[i];
      if (!instr) continue;
      try {
        this.executer(instr, cadre);
      } catch (e) {
        if (e instanceof ErreurCompilation && e.ligne === 0) e.ligne = instr.ligne;
        if (!(e instanceof ErreurVba)) throw e;
        e.ligne ??= instr.ligne;
        if (cadre.enGestion || cadre.surErreur === "aucun") throw e;
        this.err.definir(e);
        if (cadre.surErreur === "suivante") continue;
        if (this.gerer(cadre, cadre.surErreur.etiquette) === "ici") i--;
      }
    }
  }

  /**
   * Lance le gestionnaire d'erreur (On Error GoTo étiquette), là où l'erreur s'est produite :
   * Resume Next reprend ainsi à l'instruction suivante, même au milieu d'une boucle.
   */
  private gerer(cadre: Cadre, etiquette: string): "suivante" | "ici" {
    const procedure = cadre.procedure;
    if (!procedure) throw new ErreurVba(5);
    cadre.enGestion = true;
    try {
      this.executerCorps(
        procedure.corps,
        cadre,
        positionEtiquette(procedure.corps, etiquette, 0) + 1,
      );
    } catch (e) {
      if (!(e instanceof Reprise)) throw e;
      cadre.enGestion = false;
      this.err.effacer();
      if (typeof e.mode === "object") throw new Saut(e.mode.etiquette, 0);
      return e.mode;
    } finally {
      cadre.enGestion = false;
    }
    // Le gestionnaire est allé jusqu'au bout de la procédure.
    throw new Sortie(procedure.genre);
  }

  // ——— Instructions ———

  private executer(instr: Instr, cadre: Cadre): void {
    switch (instr.k) {
      case "dim":
      case "const":
      case "etiquette":
        return;
      case "affecter":
        this.affecter(instr.cible, instr.expr, instr.set, cadre, instr.ligne);
        return;
      case "appel":
        this.executerAppel(instr.cible, instr.args, cadre, instr.ligne);
        return;
      case "print":
        this.imprimer(instr.elements, cadre);
        return;
      case "si":
        for (const branche of instr.branches) {
          if (enBooleen(this.evaluer(branche.cond, cadre))) {
            this.executerListe(branche.corps, cadre);
            return;
          }
        }
        this.executerListe(instr.sinon, cadre);
        return;
      case "selon": {
        const valeur = simple(this.evaluer(instr.expr, cadre));
        for (const cas of instr.cas) {
          if (cas.tests.some((test) => this.correspond(test, valeur, cadre))) {
            this.executerListe(cas.corps, cadre);
            return;
          }
        }
        if (instr.sinon) this.executerListe(instr.sinon, cadre);
        return;
      }
      case "pour":
        this.pour(instr, cadre);
        return;
      case "pourChaque":
        this.pourChaque(instr, cadre);
        return;
      case "faire":
        for (;;) {
          if (instr.avant && !this.continuer(instr.avant, cadre)) return;
          try {
            this.executerListe(instr.corps, cadre);
          } catch (e) {
            if (e instanceof Sortie && e.quoi === "do") return;
            throw e;
          }
          if (instr.apres && !this.continuer(instr.apres, cadre)) return;
        }
      case "avec":
        cadre.avec.push(this.objet(instr.objet, cadre));
        try {
          this.executerListe(instr.corps, cadre);
        } finally {
          cadre.avec.pop();
        }
        return;
      case "sortir":
        throw new Sortie(instr.quoi);
      case "surErreur":
        cadre.surErreur = instr.mode === "zero" ? "aucun" : instr.mode;
        this.err.effacer();
        return;
      case "reprendre":
        if (!cadre.enGestion) throw new ErreurVba(20, "Resume sans erreur");
        throw new Reprise(instr.mode);
      case "allerA":
        throw new Saut(instr.etiquette, instr.ligne);
      case "redim":
        this.redimensionner(instr, cadre);
        return;
      case "effacer":
        for (const nom of instr.noms) {
          const variable = this.trouver(nom, cadre);
          if (!variable || !(variable.valeur instanceof TableauVba)) throw new ErreurVba(13);
          variable.valeur = variable.fixe
            ? new TableauVba(variable.valeur.bornes, variable.valeur.typeElement)
            : new TableauVba([], variable.valeur.typeElement);
        }
        return;
      case "fin":
        throw new FinProgramme();
    }
  }

  private continuer(condition: { jusqua: boolean; cond: Expr }, cadre: Cadre): boolean {
    const vrai = enBooleen(this.evaluer(condition.cond, cadre));
    return condition.jusqua ? !vrai : vrai;
  }

  private correspond(test: TestCas, valeur: Valeur, cadre: Cadre): boolean {
    switch (test.k) {
      case "egal":
        return this.comparer(valeur, this.evaluer(test.expr, cadre)) === 0;
      case "plage": {
        const bas = this.comparer(valeur, this.evaluer(test.de, cadre));
        const haut = this.comparer(valeur, this.evaluer(test.a, cadre));
        return bas !== null && haut !== null && bas >= 0 && haut <= 0;
      }
      case "comparaison":
        return this.binaire(test.op, valeur, this.evaluer(test.expr, cadre)) === true;
    }
  }

  private pour(instr: Extract<Instr, { k: "pour" }>, cadre: Cadre): void {
    if (instr.variable.k !== "nom")
      throw new ErreurCompilation("Variable de boucle attendue après For", instr.ligne);
    const { nom, texte } = instr.variable;
    const compteur = this.variable(nom, texte, cadre, instr.ligne);
    const debut = enNombre(this.evaluer(instr.debut, cadre));
    const fin = enNombre(this.evaluer(instr.fin, cadre));
    const pas = instr.pas ? enNombre(this.evaluer(instr.pas, cadre)) : 1;
    this.ecrireCase(compteur, debut, false, texte);
    for (;;) {
      const valeur = enNombre(compteur.valeur);
      if (pas >= 0 ? valeur > fin : valeur < fin) return;
      try {
        this.executerListe(instr.corps, cadre);
      } catch (e) {
        if (e instanceof Sortie && e.quoi === "for") return;
        throw e;
      }
      this.ecrireCase(compteur, enNombre(compteur.valeur) + pas, false, texte);
    }
  }

  private pourChaque(instr: Extract<Instr, { k: "pourChaque" }>, cadre: Cadre): void {
    if (instr.variable.k !== "nom") {
      throw new ErreurCompilation("Variable de boucle attendue après For Each", instr.ligne);
    }
    const { nom, texte } = instr.variable;
    const element = this.variable(nom, texte, cadre, instr.ligne);
    const collection = this.evaluer(instr.collection, cadre);
    let elements: Valeur[];
    if (collection instanceof TableauVba) elements = [...collection.donnees];
    else if (collection instanceof ObjetVba) elements = collection.elements();
    else if (collection instanceof Rien) throw new ErreurVba(91);
    else throw new ErreurVba(13, "For Each parcourt un tableau, une plage ou une collection");
    for (const valeur of elements) {
      this.ecrireCase(element, valeur, valeur instanceof ObjetVba, texte);
      try {
        this.executerListe(instr.corps, cadre);
      } catch (e) {
        if (e instanceof Sortie && e.quoi === "for") return;
        throw e;
      }
    }
  }

  private redimensionner(instr: Extract<Instr, { k: "redim" }>, cadre: Cadre): void {
    const existante = this.trouver(instr.nom, cadre);
    const variable =
      existante ??
      (() => {
        if (this.module.explicite)
          throw new ErreurCompilation(`Variable non définie : « ${instr.nom} »`, instr.ligne);
        const nouvelle = new Case(undefined, instr.type ?? "variant", true);
        cadre.locales.set(instr.nom, nouvelle);
        return nouvelle;
      })();
    if (variable.fixe) throw new ErreurVba(10);
    if (!variable.tableau && variable.type !== "variant") {
      throw new ErreurCompilation(`« ${instr.nom} » n'est pas un tableau`, instr.ligne);
    }
    const bornes = this.bornes(instr.bornes, cadre);
    const ancien = variable.valeur;
    const typeElement = variable.tableau ? variable.type : (instr.type ?? "variant");
    const nouveau = new TableauVba(bornes, typeElement);
    if (instr.preserve && ancien instanceof TableauVba && !ancien.vide) {
      if (ancien.bornes.length !== bornes.length) throw new ErreurVba(9);
      ancien.bornes.slice(0, -1).forEach(([bas, haut], d) => {
        const autre = bornes[d];
        if (!autre || autre[0] !== bas || autre[1] !== haut) throw new ErreurVba(9);
      });
      for (const indices of tousLesIndices(ancien.bornes)) {
        const dedans = indices.every((indice, d) => {
          const b = bornes[d];
          return b !== undefined && indice >= b[0] && indice <= b[1];
        });
        if (dedans) nouveau.donnees[nouveau.position(indices)] = ancien.lire(indices);
      }
    }
    variable.valeur = nouveau;
  }

  private imprimer(
    elements: { expr: Expr | null; separateur: ";" | "," | null }[],
    cadre: Cadre,
  ): void {
    for (const element of elements) {
      if (element.expr) this.ecrire(texteImprime(simple(this.evaluer(element.expr, cadre))));
      if (element.separateur === ",") this.ecrire(" ".repeat(14 - (this.colonne % 14)));
    }
    if (!elements.at(-1)?.separateur) this.ecrire("\n");
  }

  private affecter(cible: Expr, expr: Expr, set: boolean, cadre: Cadre, ligne: number): void {
    const valeur = this.evaluer(expr, cadre);
    if (set && !(valeur instanceof ObjetVba) && !(valeur instanceof Rien)) throw new ErreurVba(424);
    const nonObjet = (): Valeur => (valeur instanceof ObjetVba && !set ? valeur.defaut() : valeur);

    switch (cible.k) {
      case "nom": {
        const variable = this.variable(cible.nom, cible.texte, cadre, ligne);
        this.ecrireCase(variable, valeur, set, cible.texte);
        return;
      }
      case "membre":
        this.objet(cible.objet, cadre).ecrire(cible.nom, [], set ? valeur : nonObjet());
        return;
      case "appel": {
        const { cible: fonction, args } = cible;
        if (fonction.k === "nom") {
          const variable = this.trouver(fonction.nom, cadre);
          if (variable) {
            if (variable.valeur instanceof TableauVba) {
              const indices = args.map((arg) => this.indice(arg, cadre));
              variable.valeur.ecrire(indices, set ? valeur : nonObjet());
              return;
            }
            if (variable.valeur instanceof ObjetVba) {
              variable.valeur.ecrire("", this.arguments(args, cadre), set ? valeur : nonObjet());
              return;
            }
            if (variable.valeur instanceof Rien) throw new ErreurVba(91);
            throw new ErreurVba(13);
          }
        }
        if (fonction.k === "membre") {
          this.objet(fonction.objet, cadre).ecrire(
            fonction.nom,
            this.arguments(args, cadre),
            set ? valeur : nonObjet(),
          );
          return;
        }
        const objet = this.evaluer(cible, cadre);
        if (objet instanceof ObjetVba) {
          objet.ecrire("", [], nonObjet());
          return;
        }
        throw new ErreurCompilation("Affectation impossible", ligne);
      }
      default:
        throw new ErreurCompilation("Affectation impossible", ligne);
    }
  }

  private executerAppel(cible: Expr, args: Arg[], cadre: Cadre, ligne: number): void {
    if (cible.k === "nom" && !this.trouver(cible.nom, cadre)) {
      const procedure = this.module.procedures.get(cible.nom);
      if (procedure) {
        this.appeler(procedure, args, cadre, ligne);
        return;
      }
    }
    if (args.length === 0 && cible.k !== "nom") {
      this.evaluer(cible, cadre);
      return;
    }
    this.evaluer({ k: "appel", cible, args }, cadre);
  }

  // ——— Expressions ———

  private evaluer(expr: Expr, cadre: Cadre): Valeur {
    switch (expr.k) {
      case "litteral":
        return expr.valeur;
      case "paren":
        return this.evaluer(expr.expr, cadre);
      case "nom":
        return this.lireNom(expr, cadre);
      case "membre":
        return this.objet(expr.objet, cadre).lire(expr.nom, []);
      case "appel":
        return this.evaluerAppel(expr, cadre);
      case "nouveau":
        return creerObjet(expr.classe, 0);
      case "unaire":
        return this.unaire(expr.op, simple(this.evaluer(expr.expr, cadre)));
      case "binaire": {
        const gauche = this.evaluer(expr.gauche, cadre);
        const droite = this.evaluer(expr.droite, cadre);
        if (expr.op === "is") return estLeMeme(gauche, droite);
        return this.binaire(expr.op, gauche, droite);
      }
    }
  }

  private lireNom(expr: Extract<Expr, { k: "nom" }>, cadre: Cadre): Valeur {
    const variable = this.trouver(expr.nom, cadre);
    if (variable) return variable.valeur;
    const procedure = this.module.procedures.get(expr.nom);
    if (procedure) {
      if (procedure.genre === "sub") {
        throw new ErreurCompilation(
          `« ${procedure.texte} » est une Sub : elle ne renvoie pas de valeur`,
          expr.ligne,
        );
      }
      return this.appeler(procedure, [], cadre, expr.ligne);
    }
    const fonction = FONCTIONS[expr.nom];
    if (fonction) return fonction([], this.ctx);
    if (expr.nom in CONSTANTES) return CONSTANTES[expr.nom];
    return this.variable(expr.nom, expr.texte, cadre, expr.ligne).valeur;
  }

  private evaluerAppel(expr: Extract<Expr, { k: "appel" }>, cadre: Cadre): Valeur {
    const { cible, args } = expr;
    if (cible.k === "nom") {
      const variable = this.trouver(cible.nom, cadre);
      // Dans une fonction, son nom désigne la valeur renvoyée ; avec des arguments, un appel récursif.
      const recursif =
        args.length > 0 &&
        cadre.procedure?.genre === "function" &&
        cadre.procedure.nom === cible.nom;
      if (variable && !recursif) return this.indexer(variable.valeur, args, cadre);
      const procedure = this.module.procedures.get(cible.nom);
      if (procedure) return this.appeler(procedure, args, cadre, cible.ligne);
      if (cible.nom === "typename" || cible.nom === "vartype")
        return this.typeDe(cible.nom, args, cadre);
      const fonction = FONCTIONS[cible.nom];
      if (fonction) return fonction(this.arguments(args, cadre), this.ctx);
      throw new ErreurCompilation(`Sub ou Function non définie : « ${cible.texte} »`, cible.ligne);
    }
    if (cible.k === "membre")
      return this.objet(cible.objet, cadre).lire(cible.nom, this.arguments(args, cadre));
    return this.indexer(this.evaluer(cible, cadre), args, cadre);
  }

  /** TypeName et VarType tiennent compte du type déclaré de la variable. */
  private typeDe(nom: string, args: Arg[], cadre: Cadre): Valeur {
    const expr = args[0]?.expr;
    if (!expr) throw new ErreurVba(449);
    const variable = expr.k === "nom" ? this.trouver(expr.nom, cadre) : undefined;
    const valeur = this.evaluer(expr, cadre);
    if (
      variable &&
      variable.type !== "variant" &&
      !(valeur instanceof ObjetVba) &&
      !(valeur instanceof Rien)
    ) {
      const nomType = NOMS_TYPES[variable.type] ?? "Variant";
      if (nom === "typename") return variable.tableau ? `${nomType}()` : nomType;
      const codes: Record<string, number> = {
        integer: 2,
        long: 3,
        single: 4,
        double: 5,
        currency: 6,
        date: 7,
        string: 8,
        boolean: 11,
        byte: 17,
      };
      return (codes[variable.type] ?? 12) + (variable.tableau ? 8192 : 0);
    }
    if (nom === "typename") return nomDuType(valeur);
    return (
      codeVarType(valeur instanceof ObjetVba ? 0 : valeur) + (valeur instanceof ObjetVba ? 9 : 0)
    );
  }

  private indexer(valeur: Valeur, args: Arg[], cadre: Cadre): Valeur {
    if (valeur instanceof TableauVba) {
      if (valeur.vide) throw new ErreurVba(9);
      return valeur.lire(args.map((arg) => this.indice(arg, cadre)));
    }
    if (valeur instanceof ObjetVba) return valeur.lire("", this.arguments(args, cadre));
    if (valeur instanceof Rien) throw new ErreurVba(91);
    throw new ErreurVba(13, "Tableau attendu");
  }

  private indice(arg: Arg, cadre: Cadre): number {
    if (!arg.expr) throw new ErreurVba(9);
    return enEntier(this.evaluer(arg.expr, cadre));
  }

  private arguments(args: Arg[], cadre: Cadre): Argument[] {
    return args.map((arg) => ({
      nom: arg.nom,
      valeur: arg.expr ? this.evaluer(arg.expr, cadre) : MANQUANT,
    }));
  }

  private objet(expr: Expr | null, cadre: Cadre): ObjetVba {
    if (expr === null) {
      const avec = cadre.avec.at(-1);
      if (!avec) throw new ErreurCompilation("Référence incorrecte : un « . » sans bloc With", 0);
      return avec;
    }
    const valeur = this.evaluer(expr, cadre);
    if (valeur instanceof ObjetVba) return valeur;
    if (valeur instanceof Rien) throw new ErreurVba(91);
    throw new ErreurVba(424);
  }

  private unaire(op: string, valeur: Valeur): Valeur {
    if (valeur === null) return null;
    if (op === "not") {
      if (typeof valeur === "boolean") return !valeur;
      return ~enEntier(valeur);
    }
    if (valeur instanceof DateVba) return new DateVba(-valeur.serie);
    return -enNombre(valeur);
  }

  /** Compare deux valeurs : négatif, zéro ou positif. Null si l'une vaut Null. */
  private comparer(a: Valeur, b: Valeur): number | null {
    const x = simple(a);
    const y = simple(b);
    if (x === null || y === null) return null;
    if (typeof x === "string" && typeof y === "string") return this.comparerTextes(x, y);
    if (typeof x === "string") return this.comparerTexteEtValeur(x, y);
    if (typeof y === "string") return -this.comparerTexteEtValeur(y, x);
    return enNombre(x) - enNombre(y);
  }

  /** Un texte face à un nombre : le texte doit être un nombre (« 12 » = 12). */
  private comparerTexteEtValeur(texte: string, autre: Valeur): number {
    if (autre === undefined) return this.comparerTextes(texte, "");
    const nombre = lireNombre(texte);
    if (nombre === null) throw new ErreurVba(13);
    return nombre - enNombre(autre);
  }

  private comparerTextes(a: string, b: string): number {
    const x = this.module.comparaisonTexte ? a.toLowerCase() : a;
    const y = this.module.comparaisonTexte ? b.toLowerCase() : b;
    return x < y ? -1 : x > y ? 1 : 0;
  }

  private binaire(op: string, gauche: Valeur, droite: Valeur): Valeur {
    const a = simple(gauche);
    const b = simple(droite);
    switch (op) {
      case "&":
        if (a === null && b === null) return null;
        return (a === null ? "" : enTexte(a)) + (b === null ? "" : enTexte(b));
      case "=":
      case "<>":
      case "<":
      case ">":
      case "<=":
      case ">=": {
        const ordre = this.comparer(a, b);
        if (ordre === null) return null;
        if (op === "=") return ordre === 0;
        if (op === "<>") return ordre !== 0;
        if (op === "<") return ordre < 0;
        if (op === ">") return ordre > 0;
        if (op === "<=") return ordre <= 0;
        return ordre >= 0;
      }
      case "like":
        if (a === null || b === null) return null;
        return correspondMotif(enTexte(a), enTexte(b), this.module.comparaisonTexte);
      case "and":
      case "or":
      case "xor":
      case "eqv":
      case "imp":
        return logique(op, a, b);
    }
    if (a === null || b === null) return null;
    switch (op) {
      case "+":
        if (typeof a === "string" && typeof b === "string") return a + b;
        if (typeof a === "string" && b === undefined) return a;
        if (typeof b === "string" && a === undefined) return b;
        if (a instanceof DateVba || b instanceof DateVba)
          return new DateVba(enNombre(a) + enNombre(b));
        return verifierNombre(enNombre(a) + enNombre(b));
      case "-":
        if (a instanceof DateVba && b instanceof DateVba) return a.serie - b.serie;
        if (a instanceof DateVba) return new DateVba(a.serie - enNombre(b));
        return verifierNombre(enNombre(a) - enNombre(b));
      case "*":
        return verifierNombre(enNombre(a) * enNombre(b));
      case "/": {
        const diviseur = enNombre(b);
        if (diviseur === 0) throw new ErreurVba(11);
        return verifierNombre(enNombre(a) / diviseur);
      }
      case "\\": {
        const diviseur = enEntier(b);
        if (diviseur === 0) throw new ErreurVba(11);
        return Math.trunc(enEntier(a) / diviseur);
      }
      case "mod": {
        const diviseur = enEntier(b);
        if (diviseur === 0) throw new ErreurVba(11);
        return enEntier(a) % diviseur;
      }
      case "^": {
        const resultat = enNombre(a) ** enNombre(b);
        if (Number.isNaN(resultat)) throw new ErreurVba(5);
        return verifierNombre(resultat);
      }
    }
    throw new ErreurVba(5);
  }
}

// ——— Outils ———

function verifierNombre(nombre: number): number {
  if (!Number.isFinite(nombre)) throw new ErreurVba(6);
  return nombre;
}

function logique(op: string, a: Valeur, b: Valeur): Valeur {
  if (typeof a === "boolean" && typeof b === "boolean") {
    switch (op) {
      case "and":
        return a && b;
      case "or":
        return a || b;
      case "xor":
        return a !== b;
      case "eqv":
        return a === b;
      default:
        return !a || b;
    }
  }
  // Entre nombres, les opérateurs logiques travaillent bit à bit (True vaut -1).
  const x = enEntier(a);
  const y = enEntier(b);
  switch (op) {
    case "and":
      return x & y;
    case "or":
      return x | y;
    case "xor":
      return x ^ y;
    case "eqv":
      return ~(x ^ y);
    default:
      return ~x | y;
  }
}

function estLeMeme(a: Valeur, b: Valeur): boolean {
  const objet = (v: Valeur) => v instanceof ObjetVba || v instanceof Rien;
  if (!objet(a) || !objet(b)) throw new ErreurVba(424);
  return a === b;
}

/** L'opérateur Like : ? un caractère, * plusieurs, # un chiffre, [a-z] une liste. */
function correspondMotif(texte: string, motif: string, ignorerCasse: boolean): boolean {
  let expression = "";
  for (let i = 0; i < motif.length; i++) {
    const c = motif[i] ?? "";
    if (c === "?") expression += ".";
    else if (c === "*") expression += ".*";
    else if (c === "#") expression += "\\d";
    else if (c === "[") {
      const fin = motif.indexOf("]", i);
      if (fin === -1) throw new ErreurVba(93, "Chaîne de caractères génériques incorrecte");
      let liste = motif.slice(i + 1, fin);
      const exclure = liste.startsWith("!");
      if (exclure) liste = liste.slice(1);
      expression += `[${exclure ? "^" : ""}${liste.replace(/[\\\]^]/g, "\\$&")}]`;
      i = fin;
    } else expression += c.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp(`^${expression}$`, ignorerCasse ? "is" : "s").test(texte);
}

/** Texte écrit par Debug.Print : les nombres ont une espace avant (le signe) et une après. */
function texteImprime(valeur: Valeur): string {
  if (valeur === null) return "Null";
  if (typeof valeur === "number") return `${valeur < 0 ? "" : " "}${formaterNombre(valeur)} `;
  if (valeur instanceof DateVba) return formaterDate(valeur);
  if (valeur instanceof ErreurExcel) return `Erreur ${String(valeur.numero)}`;
  if (valeur instanceof TableauVba) throw new ErreurVba(13);
  return enTexte(valeur);
}

function creerObjet(classe: string, ligne: number): ObjetVba {
  if (classe === "collection") return new CollectionVba();
  if (classe === "dictionary") return new Dictionnaire();
  throw new ErreurCompilation(
    `Impossible de créer un objet ${NOMS_TYPES[classe] ?? classe} avec New`,
    ligne,
  );
}

function positionEtiquette(corps: Instr[], etiquette: string, ligne: number): number {
  const position = corps.findIndex((instr) => instr.k === "etiquette" && instr.nom === etiquette);
  if (position === -1)
    throw new ErreurCompilation(`Étiquette non définie : « ${etiquette} »`, ligne);
  return position;
}

function* tousLesIndices(bornes: [number, number][]): Generator<number[]> {
  const indices = bornes.map(([bas]) => bas);
  if (bornes.some(([bas, haut]) => haut < bas)) return;
  for (;;) {
    yield [...indices];
    let d = 0;
    for (; d < bornes.length; d++) {
      const [bas, haut] = bornes[d] ?? [0, 0];
      const indice = (indices[d] ?? bas) + 1;
      if (indice <= haut) {
        indices[d] = indice;
        break;
      }
      indices[d] = bas;
    }
    if (d === bornes.length) return;
  }
}

/** Les blocs d'instructions contenus dans une instruction (corps d'un If, d'une boucle…). */
function sousBlocs(instr: Instr): Instr[][] {
  switch (instr.k) {
    case "si":
      return [...instr.branches.map((b) => b.corps), instr.sinon];
    case "selon":
      return [...instr.cas.map((c) => c.corps), ...(instr.sinon ? [instr.sinon] : [])];
    case "pour":
    case "pourChaque":
    case "faire":
    case "avec":
      return [instr.corps];
    default:
      return [];
  }
}

// ——— Vérifications avant l'exécution ———

/**
 * Ce que l'éditeur VBA signale avant de lancer le code : variable non déclarée
 * (Option Explicit), procédure inconnue, étiquette absente.
 */
function verifier(module: Module): void {
  const duModule = new Set<string>([
    ...module.variables.map((v) => v.nom),
    ...module.constantes.map((c) => c.nom),
    ...module.procedures.keys(),
  ]);
  const integre = (nom: string) =>
    nom in FONCTIONS || nom in CONSTANTES || nom === "typename" || nom === "vartype";

  for (const procedure of module.ordre) {
    const declarees = new Set<string>(procedure.params.map((p) => p.nom));
    if (procedure.genre === "function") declarees.add(procedure.nom);
    const affectees = new Set<string>();
    const etiquettes = new Set(
      procedure.corps.flatMap((instr) => (instr.k === "etiquette" ? [instr.nom] : [])),
    );
    const parcourir = (corps: Instr[], visiter: (instr: Instr) => void) => {
      for (const instr of corps) {
        visiter(instr);
        for (const bloc of sousBlocs(instr)) parcourir(bloc, visiter);
      }
    };
    parcourir(procedure.corps, (instr) => {
      if (instr.k === "dim") for (const v of instr.vars) declarees.add(v.nom);
      if (instr.k === "const") declarees.add(instr.nom);
      if (instr.k === "redim") declarees.add(instr.nom);
      if (instr.k === "affecter" && instr.cible.k === "nom") affectees.add(instr.cible.nom);
      if ((instr.k === "pour" || instr.k === "pourChaque") && instr.variable.k === "nom") {
        affectees.add(instr.variable.nom);
      }
    });
    const connue = (nom: string) => declarees.has(nom) || duModule.has(nom) || integre(nom);

    const expression = (expr: Expr | null, ligne: number, enAppel = false): void => {
      if (!expr) return;
      switch (expr.k) {
        case "nom":
          if (connue(expr.nom)) return;
          if (module.explicite)
            throw new ErreurCompilation(`Variable non définie : « ${expr.texte} »`, ligne);
          if (enAppel && !affectees.has(expr.nom)) {
            throw new ErreurCompilation(`Sub ou Function non définie : « ${expr.texte} »`, ligne);
          }
          return;
        case "membre":
          expression(expr.objet, ligne);
          return;
        case "appel":
          expression(expr.cible, ligne, true);
          for (const arg of expr.args) expression(arg.expr, ligne);
          return;
        case "binaire":
          expression(expr.gauche, ligne);
          expression(expr.droite, ligne);
          return;
        case "unaire":
        case "paren":
          expression(expr.expr, ligne);
          return;
        default:
          return;
      }
    };
    const etiquette = (nom: string, ligne: number) => {
      if (!etiquettes.has(nom))
        throw new ErreurCompilation(`Étiquette non définie : « ${nom} »`, ligne);
    };

    parcourir(procedure.corps, (instr) => {
      const l = instr.ligne;
      switch (instr.k) {
        case "affecter":
          expression(instr.cible, l);
          expression(instr.expr, l);
          break;
        case "appel":
          expression(instr.cible, l, true);
          for (const arg of instr.args) expression(arg.expr, l);
          break;
        case "print":
          for (const element of instr.elements) expression(element.expr, l);
          break;
        case "si":
          for (const branche of instr.branches) expression(branche.cond, l);
          break;
        case "selon":
          expression(instr.expr, l);
          for (const cas of instr.cas) {
            for (const test of cas.tests) {
              if (test.k === "plage") {
                expression(test.de, l);
                expression(test.a, l);
              } else expression(test.expr, l);
            }
          }
          break;
        case "pour":
          expression(instr.variable, l);
          expression(instr.debut, l);
          expression(instr.fin, l);
          expression(instr.pas, l);
          break;
        case "pourChaque":
          expression(instr.variable, l);
          expression(instr.collection, l);
          break;
        case "faire":
          expression(instr.avant?.cond ?? null, l);
          expression(instr.apres?.cond ?? null, l);
          break;
        case "avec":
          expression(instr.objet, l);
          break;
        case "redim":
          for (const borne of instr.bornes) {
            expression(borne.bas, l);
            expression(borne.haut, l);
          }
          break;
        case "surErreur":
          if (typeof instr.mode === "object") etiquette(instr.mode.etiquette, l);
          break;
        case "reprendre":
          if (typeof instr.mode === "object") etiquette(instr.mode.etiquette, l);
          break;
        case "allerA":
          etiquette(instr.etiquette, l);
          break;
        default:
          break;
      }
    });
  }
}
