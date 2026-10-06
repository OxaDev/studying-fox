/**
 * Valeurs manipulées par l'interpréteur VBA, et leurs conversions.
 * Les textes suivent un Excel réglé en français : virgule décimale, « Vrai » et « Faux ».
 */

/** Erreur d'exécution, avec le numéro qu'aurait donné Excel. */
export class ErreurVba extends Error {
  readonly numero: number;
  ligne: number | null = null;

  constructor(numero: number, message?: string) {
    super(message ?? MESSAGES_ERREUR[numero] ?? "Erreur définie par l'application ou par l'objet");
    this.numero = numero;
  }
}

/** Erreur trouvée avant l'exécution : le code n'est pas du VBA valide. */
export class ErreurCompilation extends Error {
  /** 0 tant que la ligne n'est pas connue : l'instruction en cours la complète. */
  ligne: number;

  constructor(message: string, ligne: number) {
    super(message);
    this.ligne = ligne;
  }
}

export const MESSAGES_ERREUR: Record<number, string> = {
  5: "Argument ou appel de procédure incorrect",
  6: "Dépassement de capacité",
  9: "L'indice n'appartient pas à la sélection",
  10: "Ce tableau est fixe ou temporairement verrouillé",
  11: "Division par zéro",
  13: "Incompatibilité de type",
  28: "Espace pile insuffisant",
  91: "Variable objet ou variable de bloc With non définie",
  94: "Utilisation incorrecte de Null",
  424: "Objet requis",
  429: "Un composant ActiveX ne peut pas créer d'objet",
  438: "Propriété ou méthode non gérée par cet objet",
  449: "Argument non facultatif",
  450: "Nombre d'arguments incorrect ou affectation de propriété incorrecte",
  457: "Cette clé est déjà associée à un élément de cette collection",
  1004: "Erreur définie par l'application ou par l'objet",
};

/** Date au sens d'Excel : un nombre de jours depuis le 30/12/1899, la partie décimale donne l'heure. */
export class DateVba {
  readonly serie: number;

  constructor(serie: number) {
    this.serie = serie;
  }
}

/** Numéros des erreurs de cellule, tels que VBA les voit (CVErr). */
export const ERREURS_EXCEL: Record<string, number> = {
  "#NULL!": 2000,
  "#DIV/0!": 2007,
  "#VALUE!": 2015,
  "#REF!": 2023,
  "#NAME?": 2029,
  "#NUM!": 2036,
  "#N/A": 2042,
};

/** Erreur d'une cellule : le résultat d'une formule impossible (#DIV/0!, #N/A…). */
export class ErreurExcel {
  readonly code: string;

  constructor(code: string) {
    this.code = code;
  }

  get numero(): number {
    return ERREURS_EXCEL[this.code] ?? 2015;
  }
}

/** `Nothing` : une variable objet qui ne désigne rien. */
export class Rien {
  readonly nom = "Nothing";
}
export const RIEN = new Rien();

/** Argument facultatif non fourni (IsMissing). */
export class Manquant {
  readonly nom = "Missing";
}
export const MANQUANT = new Manquant();

/** Argument d'une méthode d'objet ou d'une fonction intégrée, éventuellement nommé (`After:=`). */
export interface Argument {
  nom: string | null;
  valeur: Valeur | Manquant;
}

/** Objet Excel ou d'une bibliothèque (Range, Worksheet, Collection…). */
export abstract class ObjetVba {
  abstract readonly nomType: string;

  /** Propriété ou méthode. Le nom est en minuscules ; "" désigne le membre par défaut. */
  lire(nom: string, args: Argument[]): Valeur {
    const membre = `${this.nomType}.${nom || "défaut"}${args.length > 0 ? "(…)" : ""}`;
    throw new ErreurVba(438, `${MESSAGES_ERREUR[438] ?? ""} (${membre})`);
  }

  /** Affecte une propriété. Par défaut, affecte la propriété par défaut de l'objet obtenu. */
  ecrire(nom: string, args: Argument[], valeur: Valeur): void {
    const objet = nom === "" ? undefined : this.lire(nom, args);
    if (objet instanceof ObjetVba) {
      objet.ecrire("", [], valeur);
      return;
    }
    throw new ErreurVba(450);
  }

  /** Les éléments parcourus par `For Each`. */
  elements(): Valeur[] {
    throw new ErreurVba(438, `On ne peut pas parcourir un objet ${this.nomType} avec For Each`);
  }

  /** La valeur de l'objet quand on l'utilise comme un nombre ou un texte (Range → Value). */
  defaut(): Valeur {
    return this.lire("", []);
  }
}

/**
 * Tableau VBA, à une ou plusieurs dimensions. Les éléments sont rangés comme en VBA,
 * le premier indice variant le plus vite (c'est l'ordre de For Each).
 */
export class TableauVba {
  readonly bornes: [number, number][];
  readonly typeElement: string;
  donnees: Valeur[];

  constructor(bornes: [number, number][], typeElement: string, donnees?: Valeur[]) {
    this.bornes = bornes;
    this.typeElement = typeElement;
    const taille = bornes.reduce((total, [bas, haut]) => total * Math.max(0, haut - bas + 1), 1);
    this.donnees = donnees ?? Array.from({ length: taille }, () => valeurInitiale(typeElement));
  }

  /** Vrai pour `Dim t() As String` avant tout ReDim. */
  get vide(): boolean {
    return this.bornes.length === 0;
  }

  position(indices: number[]): number {
    if (indices.length !== this.bornes.length) throw new ErreurVba(9);
    let position = 0;
    let pas = 1;
    for (const [dimension, indice] of indices.entries()) {
      const bornes = this.bornes[dimension];
      if (!bornes) throw new ErreurVba(9);
      const [bas, haut] = bornes;
      if (indice < bas || indice > haut) throw new ErreurVba(9);
      position += (indice - bas) * pas;
      pas *= haut - bas + 1;
    }
    return position;
  }

  lire(indices: number[]): Valeur {
    return this.donnees[this.position(indices)];
  }

  ecrire(indices: number[], valeur: Valeur): void {
    this.donnees[this.position(indices)] = convertir(valeur, this.typeElement);
  }

  copier(): TableauVba {
    return new TableauVba(
      this.bornes.map(([bas, haut]) => [bas, haut]),
      this.typeElement,
      this.donnees.map((valeur) => (valeur instanceof TableauVba ? valeur.copier() : valeur)),
    );
  }
}

/** `undefined` est la valeur Empty, `null` la valeur Null. */
export type Valeur =
  | undefined
  | null
  | boolean
  | number
  | string
  | DateVba
  | ErreurExcel
  | TableauVba
  | ObjetVba
  | Rien
  | Manquant;

/** Types qui ne contiennent que des objets : on les affecte avec Set. */
export const TYPES_OBJET = new Set([
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

export const TYPES_SCALAIRES = new Set([
  "variant",
  "integer",
  "long",
  "longlong",
  "byte",
  "single",
  "double",
  "currency",
  "string",
  "boolean",
  "date",
]);

/** Nom affiché par TypeName, avec la casse de VBA. */
export const NOMS_TYPES: Record<string, string> = {
  variant: "Variant",
  integer: "Integer",
  long: "Long",
  longlong: "LongLong",
  byte: "Byte",
  single: "Single",
  double: "Double",
  currency: "Currency",
  string: "String",
  boolean: "Boolean",
  date: "Date",
  object: "Object",
  range: "Range",
  worksheet: "Worksheet",
  workbook: "Workbook",
  collection: "Collection",
  dictionary: "Dictionary",
};

export function valeurInitiale(type: string): Valeur {
  if (TYPES_OBJET.has(type)) return RIEN;
  switch (type) {
    case "variant":
      return undefined;
    case "string":
      return "";
    case "boolean":
      return false;
    case "date":
      return new DateVba(0);
    default:
      return 0;
  }
}

/** Arrondi au pair le plus proche, comme CInt et Round en VBA (2,5 → 2 ; 3,5 → 4). */
export function arrondiBancaire(nombre: number, decimales = 0): number {
  const facteur = 10 ** decimales;
  const valeur = nombre * facteur;
  const entier = Math.floor(valeur);
  const reste = valeur - entier;
  const epsilon = 1e-9;
  let resultat: number;
  if (Math.abs(reste - 0.5) < epsilon) resultat = entier % 2 === 0 ? entier : entier + 1;
  else resultat = Math.round(valeur);
  return resultat / facteur;
}

/** Les objets valent leur propriété par défaut (Range → Value). */
export function simple(valeur: Valeur): Valeur {
  if (valeur instanceof ObjetVba) return valeur.defaut();
  if (valeur instanceof Rien) throw new ErreurVba(91);
  if (valeur instanceof Manquant) throw new ErreurVba(449);
  return valeur;
}

const NOMBRE = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)(e[+-]?\d+)?$/i;

/** Lit un nombre écrit en français (3,5) ou à l'anglaise (3.5). Renvoie null si ce n'en est pas un. */
export function lireNombre(texte: string): number | null {
  const propre = texte.trim().replace(/[\s\u00a0\u202f]/g, "");
  if (/^&h[0-9a-f]+$/i.test(propre)) return parseInt(propre.slice(2), 16);
  if (!NOMBRE.test(propre)) return null;
  return Number(propre.replace(",", "."));
}

export function enNombre(valeur: Valeur): number {
  const v = simple(valeur);
  if (v === undefined) return 0;
  if (v === null) throw new ErreurVba(94);
  if (typeof v === "boolean") return v ? -1 : 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const nombre = lireNombre(v);
    if (nombre === null) throw new ErreurVba(13);
    return nombre;
  }
  if (v instanceof DateVba) return v.serie;
  throw new ErreurVba(13);
}

export function estNumerique(valeur: Valeur): boolean {
  const v = simple(valeur);
  if (v === undefined || typeof v === "number" || typeof v === "boolean") return true;
  if (typeof v === "string") return lireNombre(v) !== null;
  return false;
}

export function enEntier(valeur: Valeur, min = -2147483648, max = 2147483647): number {
  const nombre = arrondiBancaire(enNombre(valeur));
  if (nombre < min || nombre > max) throw new ErreurVba(6);
  return nombre;
}

export function enBooleen(valeur: Valeur): boolean {
  const v = simple(valeur);
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const minuscule = v.trim().toLowerCase();
    if (minuscule === "vrai" || minuscule === "true") return true;
    if (minuscule === "faux" || minuscule === "false") return false;
  }
  return enNombre(v) !== 0;
}

/** Nombre affiché à la façon de VBA : 15 chiffres significatifs au plus, virgule décimale. */
export function formaterNombre(nombre: number): string {
  if (Number.isInteger(nombre) && Math.abs(nombre) < 1e15) return String(nombre);
  const arrondi = Number(nombre.toPrecision(15));
  const texte = String(arrondi);
  const exposant = /^(-?[\d.]+)e([+-])(\d+)$/.exec(texte);
  if (exposant) {
    const [, mantisse = "", signe = "", puissance = ""] = exposant;
    return `${mantisse.replace(".", ",")}E${signe}${puissance.padStart(2, "0")}`;
  }
  return texte.replace(".", ",");
}

const MS_PAR_JOUR = 86_400_000;
const ORIGINE = Date.UTC(1899, 11, 30);

export function dateDepuisParties(
  annee: number,
  mois: number,
  jour: number,
  heures = 0,
  minutes = 0,
  secondes = 0,
): DateVba {
  const ms = Date.UTC(annee, mois - 1, jour, heures, minutes, secondes);
  return new DateVba((ms - ORIGINE) / MS_PAR_JOUR);
}

export interface PartiesDate {
  annee: number;
  mois: number;
  jour: number;
  heures: number;
  minutes: number;
  secondes: number;
  /** 1 = dimanche, comme Weekday. */
  jourSemaine: number;
}

export function partiesDate(date: DateVba): PartiesDate {
  const ms = Math.round((date.serie * MS_PAR_JOUR) / 1000) * 1000 + ORIGINE;
  const d = new Date(ms);
  return {
    annee: d.getUTCFullYear(),
    mois: d.getUTCMonth() + 1,
    jour: d.getUTCDate(),
    heures: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    secondes: d.getUTCSeconds(),
    jourSemaine: d.getUTCDay() + 1,
  };
}

function deux(nombre: number): string {
  return String(nombre).padStart(2, "0");
}

export function formaterDate(date: DateVba): string {
  const p = partiesDate(date);
  const jour = `${deux(p.jour)}/${deux(p.mois)}/${String(p.annee)}`;
  const heure = `${deux(p.heures)}:${deux(p.minutes)}:${deux(p.secondes)}`;
  const avecHeure = Math.abs(date.serie - Math.floor(date.serie)) > 1e-9;
  if (!avecHeure) return jour;
  if (Math.floor(date.serie) === 0) return heure;
  return `${jour} ${heure}`;
}

/** Lit une date écrite jj/mm/aaaa (avec une heure éventuelle) ou aaaa-mm-jj. */
export function lireDate(texte: string): DateVba | null {
  const t = texte.trim();
  let parties =
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (parties) {
    const [, j = "", m = "", a = "", h = "0", mi = "0", s = "0"] = parties;
    const annee = a.length === 2 ? 2000 + Number(a) : Number(a);
    return dateValide(annee, Number(m), Number(j), Number(h), Number(mi), Number(s));
  }
  parties = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (parties) {
    const [, a = "", m = "", j = ""] = parties;
    return dateValide(Number(a), Number(m), Number(j));
  }
  parties = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (parties) {
    const [, h = "", mi = "", s = "0"] = parties;
    return new DateVba((Number(h) * 3600 + Number(mi) * 60 + Number(s)) / 86400);
  }
  return null;
}

function dateValide(
  annee: number,
  mois: number,
  jour: number,
  heures = 0,
  minutes = 0,
  secondes = 0,
): DateVba | null {
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31 || heures > 23 || minutes > 59) return null;
  const date = dateDepuisParties(annee, mois, jour, heures, minutes, secondes);
  const p = partiesDate(date);
  return p.jour === jour && p.mois === mois ? date : null;
}

export function enDate(valeur: Valeur): DateVba {
  const v = simple(valeur);
  if (v instanceof DateVba) return v;
  if (typeof v === "string") {
    const date = lireDate(v);
    if (date) return date;
    throw new ErreurVba(13);
  }
  return new DateVba(enNombre(v));
}

export function enTexte(valeur: Valeur): string {
  const v = simple(valeur);
  if (v === undefined) return "";
  if (v === null) throw new ErreurVba(94);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Vrai" : "Faux";
  if (typeof v === "number") return formaterNombre(v);
  if (v instanceof DateVba) return formaterDate(v);
  throw new ErreurVba(13);
}

/** Convertit une valeur vers le type déclaré d'une variable (Dim x As Integer). */
export function convertir(valeur: Valeur, type: string): Valeur {
  if (TYPES_OBJET.has(type)) {
    if (valeur instanceof Rien) return valeur;
    if (!(valeur instanceof ObjetVba)) throw new ErreurVba(13);
    if (type !== "object" && valeur.nomType.toLowerCase() !== type) throw new ErreurVba(13);
    return valeur;
  }
  switch (type) {
    case "variant":
      return valeur instanceof TableauVba ? valeur.copier() : valeur;
    case "integer":
      return enEntier(valeur, -32768, 32767);
    case "long":
      return enEntier(valeur);
    case "longlong":
      return enEntier(valeur, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    case "byte":
      return enEntier(valeur, 0, 255);
    case "single":
    case "double":
      return enNombre(valeur);
    case "currency":
      return arrondiBancaire(enNombre(valeur), 4);
    case "string":
      return enTexte(valeur);
    case "boolean":
      return enBooleen(valeur);
    case "date":
      return enDate(valeur);
    default:
      return valeur;
  }
}

/** Nom renvoyé par TypeName pour une valeur Variant. */
export function nomDuType(valeur: Valeur): string {
  if (valeur === undefined) return "Empty";
  if (valeur === null) return "Null";
  if (typeof valeur === "boolean") return "Boolean";
  if (typeof valeur === "string") return "String";
  if (typeof valeur === "number") {
    if (!Number.isInteger(valeur)) return "Double";
    if (valeur >= -32768 && valeur <= 32767) return "Integer";
    return valeur >= -2147483648 && valeur <= 2147483647 ? "Long" : "Double";
  }
  if (valeur instanceof DateVba) return "Date";
  if (valeur instanceof ErreurExcel) return "Error";
  if (valeur instanceof TableauVba) return `${NOMS_TYPES[valeur.typeElement] ?? "Variant"}()`;
  if (valeur instanceof Rien) return "Nothing";
  if (valeur instanceof Manquant) return "Error";
  return valeur.nomType;
}
