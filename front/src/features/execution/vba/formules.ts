/**
 * Calcul des formules Excel (ADR 0027).
 *
 * Une cellule à formule est calculée chaque fois qu'on la lit : le résultat est toujours
 * à jour, sans graphe de dépendances. Les fonctions d'agrégat et de recherche sont celles
 * de WorksheetFunction, partagées avec le VBA.
 */
import {
  type Classeur,
  type Feuille,
  FonctionsFeuille,
  NB_COLONNES,
  NB_LIGNES,
  Plage,
} from "./classeur";
import { type NoeudFormule, position, type Reference } from "./formules-syntaxe";
import {
  type Argument,
  dateDepuisParties,
  DateVba,
  ErreurExcel,
  ErreurVba,
  formaterNombre,
  lireDate,
  lireNombre,
  partiesDate,
  TableauVba,
  type Valeur,
} from "./valeurs";

/** Ce que manipule une formule : une valeur simple, une erreur, ou une plage de cellules. */
type Resultat = number | string | boolean | DateVba | ErreurExcel | Plage | undefined;

/** Une erreur de cellule qui remonte le calcul (=A1+1 où A1 vaut #DIV/0!). */
class Propagation extends Error {
  readonly erreur: ErreurExcel;

  constructor(erreur: ErreurExcel) {
    super(erreur.code);
    this.erreur = erreur;
  }
}

/** Une référence circulaire : remonte jusqu'à la cellule où le cycle a commencé. */
class Circulaire extends Error {
  readonly cle: string;

  constructor(cle: string) {
    super("Référence circulaire");
    this.cle = cle;
  }
}

function echec(code: string): never {
  throw new Propagation(new ErreurExcel(code));
}

interface Position {
  feuille: Feuille;
  ligne: number;
  colonne: number;
}

/** Les fonctions de WorksheetFunction utilisables telles quelles, et l'erreur de cellule si elles échouent. */
const PARTAGEES: Record<string, string> = {
  SUM: "#VALUE!",
  PRODUCT: "#VALUE!",
  AVERAGE: "#DIV/0!",
  MAX: "#VALUE!",
  MIN: "#VALUE!",
  MEDIAN: "#NUM!",
  LARGE: "#NUM!",
  SMALL: "#NUM!",
  COUNT: "#VALUE!",
  COUNTA: "#VALUE!",
  COUNTBLANK: "#VALUE!",
  COUNTIF: "#VALUE!",
  SUMIF: "#VALUE!",
  AVERAGEIF: "#DIV/0!",
  VLOOKUP: "#N/A",
  MATCH: "#N/A",
  INDEX: "#REF!",
  ROUND: "#VALUE!",
  ROUNDUP: "#VALUE!",
  ROUNDDOWN: "#VALUE!",
  TRIM: "#VALUE!",
  PROPER: "#VALUE!",
  TEXT: "#VALUE!",
};

/** Ces fonctions comptent les cellules : une cellule en erreur ne les fait pas échouer. */
const TOLERANTES = new Set(["COUNT", "COUNTA", "COUNTBLANK", "COUNTIF"]);

export class MoteurFormules {
  private readonly classeur: Classeur;
  private readonly maintenant: () => Date;
  private readonly fonctions = new FonctionsFeuille();
  /** Les cellules en cours de calcul : les revoir signale une référence circulaire. */
  private readonly enCours = new Set<string>();

  constructor(classeur: Classeur, maintenant: () => Date) {
    this.classeur = classeur;
    this.maintenant = maintenant;
  }

  /** La valeur d'une cellule à formule. Une référence circulaire vaut 0, comme dans Excel. */
  calculer(feuille: Feuille, ligne: number, colonne: number, formule: NoeudFormule): Valeur {
    const cle = `${String(this.classeur.feuilles.indexOf(feuille))}:${String(ligne)}:${String(colonne)}`;
    if (this.enCours.has(cle)) throw new Circulaire(cle);
    this.enCours.add(cle);
    try {
      const resultat = this.simple(this.evaluer(formule, { feuille, ligne, colonne }));
      return resultat === undefined ? 0 : resultat;
    } catch (e) {
      if (e instanceof Propagation) return e.erreur;
      if (e instanceof Circulaire && e.cle === cle) return 0;
      throw e;
    } finally {
      this.enCours.delete(cle);
    }
  }

  // ——— Valeurs ———

  /** Une plage d'une seule cellule vaut sa valeur. Une plus grande, utilisée seule, vaut #VALUE!. */
  private simple(resultat: Resultat): Exclude<Resultat, Plage> {
    if (!(resultat instanceof Plage)) return resultat;
    if (resultat.nbLignes !== 1 || resultat.nbColonnes !== 1) echec("#VALUE!");
    return versSimple(resultat.feuille.valeur(resultat.zone.l1, resultat.zone.c1));
  }

  private valeur(noeud: NoeudFormule, ici: Position): Exclude<Resultat, Plage | ErreurExcel> {
    const resultat = this.simple(this.evaluer(noeud, ici));
    if (resultat instanceof ErreurExcel) throw new Propagation(resultat);
    return resultat;
  }

  private nombre(noeud: NoeudFormule, ici: Position): number {
    return versNombre(this.valeur(noeud, ici));
  }

  private texte(noeud: NoeudFormule, ici: Position): string {
    return versTexte(this.valeur(noeud, ici));
  }

  private booleen(noeud: NoeudFormule, ici: Position): boolean {
    const v = this.valeur(noeud, ici);
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const majuscules = v.toUpperCase();
      if (majuscules === "TRUE" || majuscules === "VRAI") return true;
      if (majuscules === "FALSE" || majuscules === "FAUX") return false;
      return echec("#VALUE!");
    }
    return versNombre(v) !== 0;
  }

  // ——— Évaluation ———

  private feuilleDe(ref: Reference, ici: Position): Feuille {
    if (ref.feuille === null) return ici.feuille;
    const nom = ref.feuille.toLowerCase();
    return this.classeur.feuilles.find((f) => f.nom.toLowerCase() === nom) ?? echec("#REF!");
  }

  private evaluer(noeud: NoeudFormule, ici: Position): Resultat {
    switch (noeud.k) {
      case "nombre":
      case "texte":
      case "booleen":
        return noeud.valeur;
      case "erreur":
        return new ErreurExcel(noeud.code);
      case "vide":
        return undefined;
      case "nom":
        return new ErreurExcel("#NAME?");
      case "paren":
        return this.evaluer(noeud.expr, ici);
      case "cellule": {
        const feuille = this.feuilleDe(noeud.ref, ici);
        const l = position(noeud.ref.ligne, ici.ligne);
        const c = position(noeud.ref.colonne, ici.colonne);
        if (l < 1 || c < 1 || l > NB_LIGNES || c > NB_COLONNES) echec("#REF!");
        return feuille.plage({ l1: l, c1: c, l2: l, c2: c });
      }
      case "plage":
        return this.plage(noeud, ici);
      case "unaire": {
        const n = this.nombre(noeud.expr, ici);
        return noeud.op === "-" ? -n : noeud.op === "%" ? n / 100 : n;
      }
      case "binaire":
        return this.binaire(noeud.op, noeud.gauche, noeud.droite, ici);
      case "fonction":
        return this.fonction(noeud.nom, noeud.args, ici);
    }
  }

  /** Une plage. Les colonnes entières (A:A) s'arrêtent à la zone utilisée de la feuille. */
  private plage(noeud: Extract<NoeudFormule, { k: "plage" }>, ici: Position): Plage {
    const feuille = this.feuilleDe(noeud.debut, ici);
    let l1 = position(noeud.debut.ligne, ici.ligne);
    let l2 = position(noeud.fin.ligne, ici.ligne);
    let c1 = position(noeud.debut.colonne, ici.colonne);
    let c2 = position(noeud.fin.colonne, ici.colonne);
    if (noeud.mode === "colonnes") {
      l1 = 1;
      l2 = NB_LIGNES;
    }
    if (noeud.mode === "lignes") {
      c1 = 1;
      c2 = NB_COLONNES;
    }
    [l1, l2] = [Math.min(l1, l2), Math.max(l1, l2)];
    [c1, c2] = [Math.min(c1, c2), Math.max(c1, c2)];
    if (l1 < 1 || c1 < 1 || l2 > NB_LIGNES || c2 > NB_COLONNES) echec("#REF!");
    const utilisee = feuille.zoneUtilisee();
    l2 = Math.min(l2, Math.max(utilisee.l2, l1));
    c2 = Math.min(c2, Math.max(utilisee.c2, c1));
    return feuille.plage({ l1, c1, l2, c2 });
  }

  private binaire(op: string, gauche: NoeudFormule, droite: NoeudFormule, ici: Position): Resultat {
    if (op === "&") return this.texte(gauche, ici) + this.texte(droite, ici);
    if (["=", "<>", "<", ">", "<=", ">="].includes(op)) {
      const ordre = comparer(this.valeur(gauche, ici), this.valeur(droite, ici));
      switch (op) {
        case "=":
          return ordre === 0;
        case "<>":
          return ordre !== 0;
        case "<":
          return ordre < 0;
        case ">":
          return ordre > 0;
        case "<=":
          return ordre <= 0;
        default:
          return ordre >= 0;
      }
    }
    const a = this.valeur(gauche, ici);
    const b = this.valeur(droite, ici);
    const x = versNombre(a);
    const y = versNombre(b);
    let resultat: number;
    switch (op) {
      case "+":
        resultat = x + y;
        break;
      case "-":
        resultat = x - y;
        break;
      case "*":
        resultat = x * y;
        break;
      case "/":
        if (y === 0) echec("#DIV/0!");
        resultat = x / y;
        break;
      default:
        resultat = x ** y;
    }
    if (!Number.isFinite(resultat)) echec("#NUM!");
    // Une date plus ou moins des jours reste une date.
    if ((op === "+" || op === "-") && a instanceof DateVba !== b instanceof DateVba) {
      return new DateVba(resultat);
    }
    return resultat;
  }

  // ——— Fonctions ———

  private fonction(nom: string, args: NoeudFormule[], ici: Position): Resultat {
    const arg = (index: number): NoeudFormule => args[index] ?? { k: "vide" };
    const nombreOu = (index: number, defaut: number) =>
      args[index] && args[index].k !== "vide" ? this.nombre(arg(index), ici) : defaut;
    const attendre = (min: number, max = min) => {
      if (args.length < min || args.length > max) echec("#VALUE!");
    };

    if (nom in PARTAGEES) return this.partagee(nom, args, ici);

    switch (nom) {
      case "IF": {
        attendre(2, 3);
        if (this.booleen(arg(0), ici)) return this.simpleOuErreur(arg(1), ici);
        return args.length > 2 ? this.simpleOuErreur(arg(2), ici) : false;
      }
      case "IFERROR":
      case "IFNA": {
        attendre(2);
        const resultat = this.essayer(arg(0), ici);
        const rattrape =
          resultat instanceof ErreurExcel && (nom === "IFERROR" || resultat.code === "#N/A");
        return rattrape ? this.simpleOuErreur(arg(1), ici) : resultat;
      }
      case "ISERROR":
        attendre(1);
        return this.essayer(arg(0), ici) instanceof ErreurExcel;
      case "ISNA": {
        attendre(1);
        const resultat = this.essayer(arg(0), ici);
        return resultat instanceof ErreurExcel && resultat.code === "#N/A";
      }
      case "ISBLANK": {
        attendre(1);
        const resultat = this.evaluer(arg(0), ici);
        if (!(resultat instanceof Plage)) return false;
        return resultat.feuille.estVide(resultat.zone.l1, resultat.zone.c1);
      }
      case "ISNUMBER":
      case "ISTEXT": {
        attendre(1);
        const resultat = this.essayer(arg(0), ici);
        if (nom === "ISTEXT") return typeof resultat === "string";
        return typeof resultat === "number" || resultat instanceof DateVba;
      }
      case "AND":
      case "OR": {
        if (args.length === 0) echec("#VALUE!");
        const valeurs = args.flatMap((a) => this.logiques(a, ici));
        if (valeurs.length === 0) echec("#VALUE!");
        return nom === "AND" ? valeurs.every(Boolean) : valeurs.some(Boolean);
      }
      case "NOT":
        attendre(1);
        return !this.booleen(arg(0), ici);
      case "TRUE":
        return true;
      case "FALSE":
        return false;
      case "NA":
        return new ErreurExcel("#N/A");
      case "ABS":
        attendre(1);
        return Math.abs(this.nombre(arg(0), ici));
      case "INT":
        attendre(1);
        return Math.floor(this.nombre(arg(0), ici));
      case "MOD": {
        attendre(2);
        const x = this.nombre(arg(0), ici);
        const y = this.nombre(arg(1), ici);
        if (y === 0) echec("#DIV/0!");
        // Le reste a le signe du diviseur, contrairement à l'opérateur Mod de VBA.
        return x - y * Math.floor(x / y);
      }
      case "SQRT": {
        attendre(1);
        const x = this.nombre(arg(0), ici);
        if (x < 0) echec("#NUM!");
        return Math.sqrt(x);
      }
      case "POWER": {
        attendre(2);
        const resultat = this.nombre(arg(0), ici) ** this.nombre(arg(1), ici);
        if (!Number.isFinite(resultat)) echec("#NUM!");
        return resultat;
      }
      case "PI":
        return Math.PI;
      case "CONCATENATE":
        return args.map((a) => this.texte(a, ici)).join("");
      case "CONCAT":
        return args
          .flatMap((a) => this.cellules(a, ici))
          .map((v) => (v === undefined ? "" : versTexte(v)))
          .join("");
      case "LEFT":
      case "RIGHT": {
        attendre(1, 2);
        const texte = this.texte(arg(0), ici);
        const n = nombreOu(1, 1);
        if (n < 0) echec("#VALUE!");
        return nom === "LEFT" ? texte.slice(0, n) : n === 0 ? "" : texte.slice(-n);
      }
      case "MID": {
        attendre(3);
        const texte = this.texte(arg(0), ici);
        const debut = this.nombre(arg(1), ici);
        const longueur = this.nombre(arg(2), ici);
        if (debut < 1 || longueur < 0) echec("#VALUE!");
        return texte.slice(debut - 1, debut - 1 + longueur);
      }
      case "LEN":
        attendre(1);
        return this.texte(arg(0), ici).length;
      case "UPPER":
        attendre(1);
        return this.texte(arg(0), ici).toUpperCase();
      case "LOWER":
        attendre(1);
        return this.texte(arg(0), ici).toLowerCase();
      case "TODAY":
      case "NOW": {
        attendre(0);
        const d = this.maintenant();
        const date = dateDepuisParties(
          d.getFullYear(),
          d.getMonth() + 1,
          d.getDate(),
          d.getHours(),
          d.getMinutes(),
          d.getSeconds(),
        );
        return nom === "TODAY" ? new DateVba(Math.floor(date.serie)) : date;
      }
      case "DATE":
        attendre(3);
        return dateDepuisParties(
          Math.trunc(this.nombre(arg(0), ici)),
          Math.trunc(this.nombre(arg(1), ici)),
          Math.trunc(this.nombre(arg(2), ici)),
        );
      case "YEAR":
      case "MONTH":
      case "DAY": {
        attendre(1);
        const p = partiesDate(versDate(this.valeur(arg(0), ici)));
        return nom === "YEAR" ? p.annee : nom === "MONTH" ? p.mois : p.jour;
      }
    }
    return new ErreurExcel("#NAME?");
  }

  /** Une fonction de WorksheetFunction : ses erreurs deviennent des erreurs de cellule. */
  private partagee(nom: string, args: NoeudFormule[], ici: Position): Resultat {
    const valeurs: Argument[] = args.map((a) => {
      const resultat = a.k === "vide" ? undefined : this.evaluer(a, ici);
      if (resultat instanceof ErreurExcel) throw new Propagation(resultat);
      if (resultat instanceof Plage && !TOLERANTES.has(nom)) {
        const erreur = premiereErreur(resultat);
        if (erreur) throw new Propagation(erreur);
      }
      return { nom: null, valeur: resultat };
    });
    let resultat: Valeur;
    try {
      resultat = this.fonctions.lire(nom.toLowerCase(), valeurs);
    } catch (e) {
      if (e instanceof ErreurVba)
        echec(e.numero === 11 ? "#DIV/0!" : (PARTAGEES[nom] ?? "#VALUE!"));
      throw e;
    }
    if (resultat instanceof TableauVba || resultat === null) return echec("#VALUE!");
    if (
      resultat === undefined ||
      typeof resultat === "number" ||
      typeof resultat === "string" ||
      typeof resultat === "boolean" ||
      resultat instanceof DateVba ||
      resultat instanceof ErreurExcel
    ) {
      return resultat;
    }
    return echec("#VALUE!");
  }

  /** Évalue sans propager l'erreur : pour SIERREUR et ESTERREUR. */
  private essayer(noeud: NoeudFormule, ici: Position): Exclude<Resultat, Plage> {
    try {
      return this.simple(this.evaluer(noeud, ici));
    } catch (e) {
      if (e instanceof Propagation) return e.erreur;
      throw e;
    }
  }

  /** Le résultat d'une branche de SI : une valeur ou une erreur, jamais une plage. */
  private simpleOuErreur(noeud: NoeudFormule, ici: Position): Exclude<Resultat, Plage> {
    return this.simple(this.evaluer(noeud, ici));
  }

  /** Les valeurs logiques d'un argument de ET et OU : dans une plage, seuls les booléens et les nombres comptent. */
  private logiques(noeud: NoeudFormule, ici: Position): boolean[] {
    const resultat = this.evaluer(noeud, ici);
    if (!(resultat instanceof Plage)) return [this.booleen(noeud, ici)];
    return this.cellules(noeud, ici).flatMap((v) => {
      if (typeof v === "boolean") return [v];
      if (typeof v === "number") return [v !== 0];
      return [];
    });
  }

  /** Toutes les valeurs d'un argument, cellule par cellule si c'est une plage. */
  private cellules(noeud: NoeudFormule, ici: Position): Simple[] {
    const resultat = this.evaluer(noeud, ici);
    if (!(resultat instanceof Plage)) {
      const v = this.simple(resultat);
      if (v instanceof ErreurExcel) throw new Propagation(v);
      return [v];
    }
    const valeurs: Simple[] = [];
    for (let l = resultat.zone.l1; l <= resultat.zone.l2; l++) {
      for (let c = resultat.zone.c1; c <= resultat.zone.c2; c++) {
        valeurs.push(versSimple(resultat.feuille.valeur(l, c)));
      }
    }
    return valeurs;
  }
}

/** La première cellule en erreur d'une plage. */
function premiereErreur(plage: Plage): ErreurExcel | null {
  for (let l = plage.zone.l1; l <= plage.zone.l2; l++) {
    for (let c = plage.zone.c1; c <= plage.zone.c2; c++) {
      const v = plage.feuille.valeur(l, c);
      if (v instanceof ErreurExcel) return v;
    }
  }
  return null;
}

// ——— Conversions, à la façon d'Excel ———

type Simple = number | string | boolean | DateVba | undefined;

/** La valeur d'une cellule dans une formule. Une cellule en erreur propage son erreur. */
function versSimple(valeur: Valeur): Simple {
  if (valeur instanceof ErreurExcel) throw new Propagation(valeur);
  if (
    valeur === undefined ||
    typeof valeur === "number" ||
    typeof valeur === "string" ||
    typeof valeur === "boolean" ||
    valeur instanceof DateVba
  ) {
    return valeur;
  }
  return echec("#VALUE!");
}

function versNombre(valeur: Simple): number {
  if (valeur === undefined) return 0;
  if (typeof valeur === "number") return valeur;
  if (typeof valeur === "boolean") return valeur ? 1 : 0;
  if (valeur instanceof DateVba) return valeur.serie;
  const nombre = lireNombre(valeur);
  if (nombre !== null) return nombre;
  const date = lireDate(valeur);
  if (date) return date.serie;
  return echec("#VALUE!");
}

function versTexte(valeur: Simple): string {
  if (valeur === undefined) return "";
  if (typeof valeur === "string") return valeur;
  if (typeof valeur === "boolean") return valeur ? "VRAI" : "FAUX";
  // Dans une formule, une date collée à du texte devient son numéro de série, comme dans Excel.
  if (valeur instanceof DateVba) return formaterNombre(valeur.serie);
  return formaterNombre(valeur);
}

function versDate(valeur: Simple): DateVba {
  if (valeur instanceof DateVba) return valeur;
  if (typeof valeur === "string") {
    const date = lireDate(valeur);
    if (date) return date;
  }
  return new DateVba(versNombre(valeur));
}

/** L'ordre d'Excel : les nombres avant les textes, les textes avant les booléens. Sans casse. */
function comparer(a: Simple, b: Simple): number {
  const rang = (v: Simple) => (typeof v === "boolean" ? 2 : typeof v === "string" ? 1 : 0);
  const x = a === undefined ? (typeof b === "string" ? "" : 0) : a;
  const y = b === undefined ? (typeof a === "string" ? "" : 0) : b;
  if (rang(x) !== rang(y)) return rang(x) - rang(y);
  if (typeof x === "string" && typeof y === "string") {
    const gauche = x.toLowerCase();
    const droite = y.toLowerCase();
    return gauche < droite ? -1 : gauche > droite ? 1 : 0;
  }
  return versNombre(x) - versNombre(y);
}
