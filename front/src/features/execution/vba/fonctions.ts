/** Fonctions et constantes intégrées de VBA (Len, Split, Format, MsgBox, vbCrLf, xlUp…). */
import {
  type Application,
  type Classeur,
  Dictionnaire,
  fourni,
  Plage,
  prendre,
  XL,
} from "./classeur";
import { formater, formaterMotifNombre, JOURS, MOIS } from "./format";
import {
  arrondiBancaire,
  type Argument,
  convertir,
  dateDepuisParties,
  DateVba,
  enBooleen,
  enDate,
  enEntier,
  enNombre,
  enTexte,
  ERREURS_EXCEL,
  ErreurExcel,
  ErreurVba,
  estNumerique,
  formaterNombre,
  lireDate,
  MANQUANT,
  Manquant,
  ObjetVba,
  partiesDate,
  Rien,
  simple,
  TableauVba,
  type Valeur,
} from "./valeurs";

/** L'objet Err : la dernière erreur d'exécution. */
export class ObjetErr extends ObjetVba {
  readonly nomType = "ErrObject";
  numero = 0;
  description = "";
  source = "";

  definir(erreur: ErreurVba): void {
    this.numero = erreur.numero;
    this.description = erreur.message;
    this.source = "VBAProject";
  }

  effacer(): void {
    this.numero = 0;
    this.description = "";
    this.source = "";
  }

  override lire(nom: string, args: Argument[]): Valeur {
    switch (nom) {
      case "":
      case "number":
        return this.numero;
      case "description":
        return this.description;
      case "source":
        return this.source;
      case "clear":
        this.effacer();
        return undefined;
      case "raise": {
        const numero = prendre(args, 0, "number");
        const source = prendre(args, 1, "source");
        const description = prendre(args, 2, "description");
        if (!fourni(numero)) throw new ErreurVba(449);
        const erreur = new ErreurVba(
          enEntier(numero),
          fourni(description) ? enTexte(description) : undefined,
        );
        this.source = fourni(source) ? enTexte(source) : "VBAProject";
        throw erreur;
      }
    }
    return super.lire(nom, args);
  }

  override ecrire(nom: string, args: Argument[], valeur: Valeur): void {
    if (nom === "number" || nom === "") this.numero = enEntier(valeur);
    else if (nom === "description") this.description = enTexte(valeur);
    else if (nom === "source") this.source = enTexte(valeur);
    else super.ecrire(nom, args, valeur);
  }
}

export interface Contexte {
  /** Écrit une ligne dans la console (MsgBox). */
  afficher: (texte: string) => void;
  classeur: Classeur;
  application: Application;
  err: ObjetErr;
  /** Option Base : premier indice de Array() et de Dim t(n). */
  base: number;
  comparaisonTexte: boolean;
  aleatoire: () => number;
  maintenant: () => Date;
}

type Fonction = (args: Argument[], ctx: Contexte) => Valeur;

/** Valeurs des arguments, dans l'ordre. */
function valeurs(args: Argument[]): (Valeur | Manquant)[] {
  return args.map((arg) => arg.valeur);
}

function obligatoire(args: Argument[], index: number): Valeur {
  const arg = args.filter((a) => a.nom === null)[index];
  if (!arg || arg.valeur instanceof Manquant) throw new ErreurVba(449);
  return arg.valeur;
}

function facultatif(args: Argument[], index: number): Valeur | Manquant {
  const arg = args.filter((a) => a.nom === null)[index];
  return arg ? arg.valeur : MANQUANT;
}

function texte(args: Argument[], index: number): string {
  return enTexte(obligatoire(args, index));
}

function entier(args: Argument[], index: number): number {
  return enEntier(obligatoire(args, index));
}

function entierOu(args: Argument[], index: number, defaut: number): number {
  const valeur = facultatif(args, index);
  return fourni(valeur) ? enEntier(valeur) : defaut;
}

/** Null se propage dans les fonctions de texte : Len(Null) vaut Null. */
function surTexte(action: (texte: string, args: Argument[]) => Valeur): Fonction {
  return (args) => {
    const valeur = simple(obligatoire(args, 0));
    if (valeur === null) return null;
    return action(enTexte(valeur), args);
  };
}

function tableauTextes(textes: string[]): TableauVba {
  return new TableauVba([[0, textes.length - 1]], "string", textes);
}

function enTableau(valeur: Valeur): TableauVba {
  const v = valeur instanceof Plage ? valeur.valeur() : valeur;
  if (!(v instanceof TableauVba)) throw new ErreurVba(13);
  return v;
}

function texteCompare(args: Argument[], index: number, ctx: Contexte): boolean {
  const mode = facultatif(args, index);
  return fourni(mode) ? enEntier(mode) === 1 : ctx.comparaisonTexte;
}

function chercher(source: string, cherche: string, debut: number, texteSeul: boolean): number {
  if (texteSeul) return source.toLowerCase().indexOf(cherche.toLowerCase(), debut);
  return source.indexOf(cherche, debut);
}

function remplacerTout(
  source: string,
  cherche: string,
  par: string,
  nombre: number,
  texteSeul: boolean,
): string {
  if (cherche === "") return source;
  let resultat = "";
  let position = 0;
  let faits = 0;
  for (;;) {
    const trouve = chercher(source, cherche, position, texteSeul);
    if (trouve === -1 || (nombre >= 0 && faits >= nombre)) break;
    resultat += source.slice(position, trouve) + par;
    position = trouve + cherche.length;
    faits++;
  }
  return resultat + source.slice(position);
}

/** Val : lit le nombre au début du texte, avec un point décimal (« 12,5 » vaut 12). */
function val(texte: string): number {
  const propre = texte.replace(/[\s]/g, "");
  if (/^&h[0-9a-f]+/i.test(propre)) return parseInt(propre.slice(2), 16);
  const nombre = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(propre);
  return nombre ? Number(nombre[0]) : 0;
}

/** Str : un nombre avec un point décimal, précédé d'une espace s'il est positif. */
function str(nombre: number): string {
  const texte = formaterNombre(nombre).replace(",", ".");
  return nombre >= 0 ? " " + texte : texte;
}

function ajouterADate(intervalle: string, nombre: number, date: DateVba): DateVba {
  const p = partiesDate(date);
  const heure = date.serie - Math.floor(date.serie);
  switch (intervalle.toLowerCase()) {
    case "yyyy":
      return moisDecales(p, nombre * 12, heure);
    case "q":
      return moisDecales(p, nombre * 3, heure);
    case "m":
      return moisDecales(p, nombre, heure);
    case "d":
    case "y":
    case "w":
      return new DateVba(date.serie + nombre);
    case "ww":
      return new DateVba(date.serie + nombre * 7);
    case "h":
      return new DateVba(date.serie + nombre / 24);
    case "n":
      return new DateVba(date.serie + nombre / 1440);
    case "s":
      return new DateVba(date.serie + nombre / 86400);
  }
  throw new ErreurVba(5);
}

/** Ajoute des mois sans déborder : 31 janvier + 1 mois = 28 ou 29 février. */
function moisDecales(p: ReturnType<typeof partiesDate>, mois: number, heure: number): DateVba {
  const total = p.annee * 12 + (p.mois - 1) + mois;
  const annee = Math.floor(total / 12);
  const nouveauMois = (total % 12) + 1;
  const dernierJour = partiesDate(dateDepuisParties(annee, nouveauMois + 1, 0)).jour;
  const jour = Math.min(p.jour, dernierJour);
  return new DateVba(dateDepuisParties(annee, nouveauMois, jour).serie + heure);
}

function ecartDates(intervalle: string, debut: DateVba, fin: DateVba): number {
  const a = partiesDate(debut);
  const b = partiesDate(fin);
  switch (intervalle.toLowerCase()) {
    case "yyyy":
      return b.annee - a.annee;
    case "q":
      return (
        Math.floor((b.mois - 1) / 3) + b.annee * 4 - (Math.floor((a.mois - 1) / 3) + a.annee * 4)
      );
    case "m":
      return (b.annee - a.annee) * 12 + b.mois - a.mois;
    case "d":
    case "y":
      return Math.floor(fin.serie) - Math.floor(debut.serie);
    case "w":
    case "ww":
      return Math.trunc((Math.floor(fin.serie) - Math.floor(debut.serie)) / 7);
    case "h":
      return Math.trunc((fin.serie - debut.serie) * 24 + 1e-9);
    case "n":
      return Math.trunc((fin.serie - debut.serie) * 1440 + 1e-9);
    case "s":
      return Math.round((fin.serie - debut.serie) * 86400);
  }
  throw new ErreurVba(5);
}

function dateLocale(maintenant: Date): DateVba {
  return dateDepuisParties(
    maintenant.getFullYear(),
    maintenant.getMonth() + 1,
    maintenant.getDate(),
    maintenant.getHours(),
    maintenant.getMinutes(),
    maintenant.getSeconds(),
  );
}

/** Code VarType d'une valeur. */
export function codeVarType(valeur: Valeur): number {
  if (valeur === undefined) return 0;
  if (valeur === null) return 1;
  if (typeof valeur === "boolean") return 11;
  if (typeof valeur === "string") return 8;
  if (typeof valeur === "number") {
    if (!Number.isInteger(valeur)) return 5;
    if (valeur >= -32768 && valeur <= 32767) return 2;
    return valeur >= -2147483648 && valeur <= 2147483647 ? 3 : 5;
  }
  if (valeur instanceof DateVba) return 7;
  if (valeur instanceof ErreurExcel) return 10;
  if (valeur instanceof TableauVba) return 8192 + 12;
  return 9;
}

const CONVERSIONS: Record<string, string> = {
  cstr: "string",
  cint: "integer",
  clng: "long",
  clnglng: "longlong",
  cdbl: "double",
  csng: "single",
  ccur: "currency",
  cdec: "double",
  cbool: "boolean",
  cbyte: "byte",
  cdate: "date",
  cvar: "variant",
};

const MATHS: Record<string, (n: number) => number> = {
  abs: Math.abs,
  int: Math.floor,
  fix: Math.trunc,
  sgn: Math.sign,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  atn: Math.atan,
};

export const FONCTIONS: Record<string, Fonction> = {
  // Textes
  len: surTexte((t) => t.length),
  left: surTexte((t, args) => {
    const n = entier(args, 1);
    if (n < 0) throw new ErreurVba(5);
    return t.slice(0, n);
  }),
  right: surTexte((t, args) => {
    const n = entier(args, 1);
    if (n < 0) throw new ErreurVba(5);
    return n === 0 ? "" : t.slice(-n);
  }),
  mid: surTexte((t, args) => {
    const debut = entier(args, 1);
    if (debut < 1) throw new ErreurVba(5);
    const longueur = facultatif(args, 2);
    return fourni(longueur)
      ? t.slice(debut - 1, debut - 1 + Math.max(0, enEntier(longueur)))
      : t.slice(debut - 1);
  }),
  ucase: surTexte((t) => t.toUpperCase()),
  lcase: surTexte((t) => t.toLowerCase()),
  trim: surTexte((t) => t.replace(/^ +| +$/g, "")),
  ltrim: surTexte((t) => t.replace(/^ +/, "")),
  rtrim: surTexte((t) => t.replace(/ +$/, "")),
  strreverse: surTexte((t) => Array.from(t).reverse().join("")),
  space: (args) => " ".repeat(Math.max(0, entier(args, 0))),
  string: (args) => {
    const motif = simple(obligatoire(args, 1));
    const caractere =
      typeof motif === "number" ? String.fromCharCode(motif) : enTexte(motif).charAt(0);
    return caractere.repeat(Math.max(0, entier(args, 0)));
  },
  chr: (args) => String.fromCharCode(entier(args, 0)),
  chrw: (args) => String.fromCharCode(entier(args, 0)),
  asc: (args) => {
    const t = texte(args, 0);
    if (t === "") throw new ErreurVba(5);
    return t.charCodeAt(0);
  },
  ascw: (args) => {
    const t = texte(args, 0);
    if (t === "") throw new ErreurVba(5);
    return t.charCodeAt(0);
  },
  instr: (args, ctx) => {
    const premier = simple(obligatoire(args, 0));
    const avecDebut = args.length >= 3 && typeof premier === "number";
    const decalage = avecDebut ? 1 : 0;
    const debut = avecDebut ? enEntier(premier) : 1;
    if (debut < 1) throw new ErreurVba(5);
    const source = texte(args, decalage);
    const cherche = texte(args, decalage + 1);
    if (cherche === "") return debut;
    return chercher(source, cherche, debut - 1, texteCompare(args, decalage + 2, ctx)) + 1;
  },
  instrrev: (args, ctx) => {
    const source = texte(args, 0);
    const cherche = texte(args, 1);
    const debut = entierOu(args, 2, -1);
    const zone = debut === -1 ? source : source.slice(0, debut);
    if (cherche === "") return debut === -1 ? source.length : debut;
    if (texteCompare(args, 3, ctx))
      return zone.toLowerCase().lastIndexOf(cherche.toLowerCase()) + 1;
    return zone.lastIndexOf(cherche) + 1;
  },
  replace: (args, ctx) => {
    const source = texte(args, 0);
    const debut = entierOu(args, 3, 1);
    const nombre = entierOu(args, 4, -1);
    // Comme en VBA, le résultat commence à la position de départ.
    return remplacerTout(
      source.slice(debut - 1),
      texte(args, 1),
      texte(args, 2),
      nombre,
      texteCompare(args, 5, ctx),
    );
  },
  split: (args, ctx) => {
    const source = texte(args, 0);
    const separateurBrut = facultatif(args, 1);
    const separateur = fourni(separateurBrut) ? enTexte(separateurBrut) : " ";
    const limite = entierOu(args, 2, -1);
    if (source === "") return new TableauVba([[0, -1]], "string", []);
    if (separateur === "") return tableauTextes([source]);
    const morceaux: string[] = [];
    let position = 0;
    const texteSeul = texteCompare(args, 3, ctx);
    for (;;) {
      if (limite > 0 && morceaux.length === limite - 1) break;
      const trouve = chercher(source, separateur, position, texteSeul);
      if (trouve === -1) break;
      morceaux.push(source.slice(position, trouve));
      position = trouve + separateur.length;
    }
    morceaux.push(source.slice(position));
    return tableauTextes(morceaux);
  },
  join: (args) => {
    const tableau = enTableau(obligatoire(args, 0));
    const separateurBrut = facultatif(args, 1);
    const separateur = fourni(separateurBrut) ? enTexte(separateurBrut) : " ";
    return tableau.donnees.map((v) => enTexte(v)).join(separateur);
  },
  strcomp: (args, ctx) => {
    const a = simple(obligatoire(args, 0));
    const b = simple(obligatoire(args, 1));
    if (a === null || b === null) return null;
    let x = enTexte(a);
    let y = enTexte(b);
    if (texteCompare(args, 2, ctx)) {
      x = x.toLowerCase();
      y = y.toLowerCase();
    }
    return x < y ? -1 : x > y ? 1 : 0;
  },
  format: (args) => {
    const valeur = simple(obligatoire(args, 0));
    if (valeur === null) return "";
    const motif = facultatif(args, 1);
    return formater(valeur, fourni(motif) ? enTexte(motif) : "");
  },
  formatnumber: (args) => {
    const decimales = entierOu(args, 1, 2);
    return formaterMotifNombre(
      enNombre(obligatoire(args, 0)),
      "#,##0" + (decimales > 0 ? "." + "0".repeat(decimales) : ""),
    );
  },
  formatcurrency: (args) => {
    const decimales = entierOu(args, 1, 2);
    return formaterMotifNombre(
      enNombre(obligatoire(args, 0)),
      "#,##0" + (decimales > 0 ? "." + "0".repeat(decimales) : "") + " €",
    );
  },
  formatpercent: (args) => {
    const decimales = entierOu(args, 1, 2);
    return formaterMotifNombre(
      enNombre(obligatoire(args, 0)),
      "0" + (decimales > 0 ? "." + "0".repeat(decimales) : "") + "%",
    );
  },
  val: (args) => val(texte(args, 0)),
  str: (args) => str(enNombre(obligatoire(args, 0))),
  hex: (args) => {
    const n = entier(args, 0);
    return (n < 0 && n >= -32768 ? n & 0xffff : n >>> 0).toString(16).toUpperCase();
  },
  oct: (args) => {
    const n = entier(args, 0);
    return (n < 0 && n >= -32768 ? n & 0xffff : n >>> 0).toString(8);
  },

  // Tests et types
  isnumeric: (args) => {
    const v = simple(obligatoire(args, 0));
    return v !== null && estNumerique(v);
  },
  iserror: (args) => obligatoire(args, 0) instanceof ErreurExcel,
  cverr: (args) => {
    const numero = entier(args, 0);
    const code = Object.entries(ERREURS_EXCEL).find(([, n]) => n === numero)?.[0];
    return new ErreurExcel(code ?? "#VALUE!");
  },
  isempty: (args) => simple(obligatoire(args, 0)) === undefined,
  isnull: (args) => simple(obligatoire(args, 0)) === null,
  isarray: (args) => obligatoire(args, 0) instanceof TableauVba,
  isobject: (args) => {
    const v = obligatoire(args, 0);
    return v instanceof ObjetVba || v instanceof Rien;
  },
  isdate: (args) => {
    const v = simple(obligatoire(args, 0));
    return v instanceof DateVba || (typeof v === "string" && lireDate(v) !== null);
  },
  ismissing: (args) => args[0]?.valeur instanceof Manquant,
  vartype: (args) => codeVarType(simple(obligatoire(args, 0))),

  // Nombres
  round: (args) => {
    const v = simple(obligatoire(args, 0));
    if (v === null) return null;
    const decimales = entierOu(args, 1, 0);
    if (decimales < 0) throw new ErreurVba(5);
    return arrondiBancaire(enNombre(v), decimales);
  },
  sqr: (args) => {
    const n = enNombre(obligatoire(args, 0));
    if (n < 0) throw new ErreurVba(5);
    return Math.sqrt(n);
  },
  log: (args) => {
    const n = enNombre(obligatoire(args, 0));
    if (n <= 0) throw new ErreurVba(5);
    return Math.log(n);
  },
  rnd: (_args, ctx) => ctx.aleatoire(),
  randomize: () => undefined,

  // Tableaux
  array: (args, ctx) => {
    const elements = valeurs(args).map((v) => (v instanceof Manquant ? undefined : v));
    return new TableauVba([[ctx.base, ctx.base + elements.length - 1]], "variant", elements);
  },
  ubound: (args) => {
    const tableau = enTableau(obligatoire(args, 0));
    const bornes = tableau.bornes[entierOu(args, 1, 1) - 1];
    if (!bornes) throw new ErreurVba(9);
    return bornes[1];
  },
  lbound: (args) => {
    const tableau = enTableau(obligatoire(args, 0));
    const bornes = tableau.bornes[entierOu(args, 1, 1) - 1];
    if (!bornes) throw new ErreurVba(9);
    return bornes[0];
  },
  filter: (args, ctx) => {
    const tableau = enTableau(obligatoire(args, 0));
    const cherche = texte(args, 1);
    const inclure = facultatif(args, 2);
    const garder = !fourni(inclure) || enBooleen(inclure);
    const texteSeul = texteCompare(args, 3, ctx);
    return tableauTextes(
      tableau.donnees
        .map((v) => enTexte(v))
        .filter((t) => (chercher(t, cherche, 0, texteSeul) !== -1) === garder),
    );
  },

  // Choix
  iif: (args) => (enBooleen(obligatoire(args, 0)) ? obligatoire(args, 1) : obligatoire(args, 2)),
  choose: (args) => {
    const index = entier(args, 0);
    const choix = args.filter((arg) => arg.nom === null)[index];
    if (index < 1 || !choix) return null;
    return choix.valeur instanceof Manquant ? undefined : choix.valeur;
  },
  switch: (args) => {
    const liste = valeurs(args);
    for (let i = 0; i + 1 < liste.length; i += 2) {
      const condition = liste[i];
      const resultat = liste[i + 1];
      if (condition instanceof Manquant || resultat instanceof Manquant) throw new ErreurVba(449);
      if (enBooleen(condition)) return resultat;
    }
    return null;
  },

  // Dates
  date: (_args, ctx) => new DateVba(Math.floor(dateLocale(ctx.maintenant()).serie)),
  now: (_args, ctx) => dateLocale(ctx.maintenant()),
  time: (_args, ctx) => {
    const serie = dateLocale(ctx.maintenant()).serie;
    return new DateVba(serie - Math.floor(serie));
  },
  timer: (_args, ctx) => {
    const d = ctx.maintenant();
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
  },
  year: (args) => partiesDate(enDate(obligatoire(args, 0))).annee,
  month: (args) => partiesDate(enDate(obligatoire(args, 0))).mois,
  day: (args) => partiesDate(enDate(obligatoire(args, 0))).jour,
  hour: (args) => partiesDate(enDate(obligatoire(args, 0))).heures,
  minute: (args) => partiesDate(enDate(obligatoire(args, 0))).minutes,
  second: (args) => partiesDate(enDate(obligatoire(args, 0))).secondes,
  weekday: (args) => {
    const jour = partiesDate(enDate(obligatoire(args, 0))).jourSemaine;
    const premier = entierOu(args, 1, 1);
    return ((jour - premier + 7) % 7) + 1;
  },
  weekdayname: (args) => {
    const premier = entierOu(args, 2, 1);
    const nom = JOURS[(entier(args, 0) - 1 + premier - 1) % 7] ?? "";
    const abrege = facultatif(args, 1);
    return fourni(abrege) && enBooleen(abrege) ? nom.slice(0, 3) + "." : nom;
  },
  monthname: (args) => {
    const nom = MOIS[entier(args, 0) - 1];
    if (nom === undefined) throw new ErreurVba(5);
    const abrege = facultatif(args, 1);
    return fourni(abrege) && enBooleen(abrege) ? nom.slice(0, 4).replace(/\.?$/, ".") : nom;
  },
  dateserial: (args) => dateDepuisParties(entier(args, 0), entier(args, 1), entier(args, 2)),
  timeserial: (args) =>
    new DateVba((entier(args, 0) * 3600 + entier(args, 1) * 60 + entier(args, 2)) / 86400),
  datevalue: (args) => new DateVba(Math.floor(enDate(obligatoire(args, 0)).serie)),
  timevalue: (args) => {
    const serie = enDate(obligatoire(args, 0)).serie;
    return new DateVba(serie - Math.floor(serie));
  },
  dateadd: (args) =>
    ajouterADate(texte(args, 0), enNombre(obligatoire(args, 1)), enDate(obligatoire(args, 2))),
  datediff: (args) =>
    ecartDates(texte(args, 0), enDate(obligatoire(args, 1)), enDate(obligatoire(args, 2))),

  // Interaction
  msgbox: (args, ctx) => {
    ctx.afficher(enTexte(obligatoire(args, 0)));
    const boutons = entierOu(args, 1, 0) & 7;
    // Pas de fenêtre ici : on répond OK, ou Oui à une question.
    return boutons === 3 || boutons === 4 ? 6 : 1;
  },
  inputbox: () => {
    throw new ErreurVba(5, "InputBox n'est pas disponible ici : mets la valeur dans une variable");
  },
  doevents: () => 0,
  beep: () => undefined,
  rgb: (args) =>
    (entier(args, 0) & 255) + (entier(args, 1) & 255) * 256 + (entier(args, 2) & 255) * 65536,
  createobject: (args) => {
    const classe = texte(args, 0).toLowerCase();
    if (classe === "scripting.dictionary") return new Dictionnaire();
    if (classe === "scripting.filesystemobject") {
      throw new ErreurVba(429, "Les fichiers ne sont pas accessibles depuis le navigateur");
    }
    throw new ErreurVba(429);
  },
  __assert: (args) => {
    if (!enBooleen(obligatoire(args, 0)))
      throw new ErreurVba(5, "Debug.Assert : la condition est fausse");
    return undefined;
  },

  // Objets d'Excel
  application: (_args, ctx) => ctx.application,
  activeworkbook: (_args, ctx) => ctx.classeur,
  thisworkbook: (_args, ctx) => ctx.classeur,
  activesheet: (_args, ctx) => ctx.classeur.active,
  activecell: (_args, ctx) => ctx.classeur.celluleActive(),
  selection: (_args, ctx) => ctx.classeur.selection ?? ctx.classeur.celluleActive(),
  worksheets: (args, ctx) => ctx.classeur.lire("worksheets", args),
  sheets: (args, ctx) => ctx.classeur.lire("sheets", args),
  range: (args, ctx) => ctx.classeur.active.lire("range", args),
  cells: (args, ctx) => ctx.classeur.active.lire("cells", args),
  rows: (args, ctx) => ctx.classeur.active.lire("rows", args),
  columns: (args, ctx) => ctx.classeur.active.lire("columns", args),
  worksheetfunction: (_args, ctx) => ctx.application.lire("worksheetfunction", []),
  err: (args, ctx) => (args.length > 0 ? ctx.err.lire("", args) : ctx.err),
};

for (const [nom, type] of Object.entries(CONVERSIONS)) {
  FONCTIONS[nom] = (args) => {
    const v = simple(obligatoire(args, 0));
    if (v === null) throw new ErreurVba(94);
    return convertir(v, type);
  };
}
for (const [nom, calcul] of Object.entries(MATHS)) {
  FONCTIONS[nom] = (args) => {
    const v = simple(obligatoire(args, 0));
    if (v === null) return null;
    return calcul(enNombre(v));
  };
}

export const CONSTANTES: Record<string, Valeur> = {
  vbcrlf: "\r\n",
  vbnewline: "\n",
  vblf: "\n",
  vbcr: "\r",
  vbtab: "\t",
  vbnullstring: "",
  vbnullchar: "\0",
  vbok: 1,
  vbcancel: 2,
  vbabort: 3,
  vbretry: 4,
  vbignore: 5,
  vbyes: 6,
  vbno: 7,
  vbokonly: 0,
  vbokcancel: 1,
  vbabortretryignore: 2,
  vbyesnocancel: 3,
  vbyesno: 4,
  vbretrycancel: 5,
  vbcritical: 16,
  vbquestion: 32,
  vbexclamation: 48,
  vbinformation: 64,
  vbdefaultbutton1: 0,
  vbdefaultbutton2: 256,
  vbbinarycompare: 0,
  vbtextcompare: 1,
  vbsunday: 1,
  vbmonday: 2,
  vbtuesday: 3,
  vbwednesday: 4,
  vbthursday: 5,
  vbfriday: 6,
  vbsaturday: 7,
  vbblack: 0,
  vbred: 255,
  vbgreen: 65280,
  vbyellow: 65535,
  vbblue: 16711680,
  vbmagenta: 16711935,
  vbcyan: 16776960,
  vbwhite: 16777215,
  vbempty: 0,
  vbnull: 1,
  vbinteger: 2,
  vblong: 3,
  vbsingle: 4,
  vbdouble: 5,
  vbcurrency: 6,
  vbdate: 7,
  vbstring: 8,
  vbobject: 9,
  vberror: 10,
  vbboolean: 11,
  vbvariant: 12,
  vbarray: 8192,
  vbobjecterror: -2147221504,
  xlup: XL.up,
  xldown: XL.down,
  xltoleft: XL.toLeft,
  xltoright: XL.toRight,
  xlwhole: XL.whole,
  xlpart: XL.part,
  xlvalues: -4163,
  xlformulas: -4123,
  xlshiftup: XL.up,
  xlshifttoleft: XL.toLeft,
  xlshiftdown: XL.down,
  xlshifttoright: XL.toRight,
  xlnone: -4142,
  xlcalculationmanual: -4135,
  xlcalculationautomatic: -4105,
  xlcenter: -4108,
  xlleft: -4131,
  xlright: -4152,
  xlpastevalues: -4163,
  xlpasteall: -4104,
  xlpasteformats: -4122,
  xlascending: 1,
  xldescending: 2,
  xlyes: 1,
  xlno: 2,
  xlautomatic: -4105,
  xlthin: 2,
  xlcontinuous: 1,
  xlunderlinestylesingle: 2,
  xlunderlinestylenone: -4142,
};
