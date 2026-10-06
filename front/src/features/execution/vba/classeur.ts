/**
 * Un classeur Excel simulé : feuilles, cellules et plages (Range), avec les propriétés
 * et méthodes les plus utilisées. Les formules Excel ne sont pas calculées.
 */
import type { FeuilleAffichee } from "../types";
import { formater, texteCellule } from "./format";
import type { MoteurFormules } from "./formules";
import {
  analyserFormule,
  ecrireFormule,
  type NoeudFormule,
  type Syntaxe,
} from "./formules-syntaxe";
import {
  type Argument,
  DateVba,
  enBooleen,
  enEntier,
  enNombre,
  enTexte,
  ErreurExcel,
  ErreurVba,
  estNumerique,
  lireNombre,
  MANQUANT,
  Manquant,
  ObjetVba,
  RIEN,
  simple,
  TableauVba,
  type Valeur,
} from "./valeurs";

export const NB_LIGNES = 1_048_576;
export const NB_COLONNES = 16_384;
/** Au-delà, une plage est trop grande pour être lue ou écrite cellule par cellule. */
const TAILLE_MAX = 200_000;
const LIGNES_AFFICHEES = 50;
const COLONNES_AFFICHEES = 15;

export const XL = {
  up: -4162,
  down: -4121,
  toLeft: -4159,
  toRight: -4161,
  whole: 1,
  part: 2,
};

// ——— Arguments ———

/** L'argument nommé `nom`, sinon l'argument en position `index`. */
export function prendre(args: Argument[], index: number, nom: string): Valeur | Manquant {
  const nomme = args.find((arg) => arg.nom === nom);
  if (nomme) return nomme.valeur;
  const positionnel = args.filter((arg) => arg.nom === null)[index];
  return positionnel ? positionnel.valeur : MANQUANT;
}

export function fourni(valeur: Valeur | Manquant): valeur is Valeur {
  return !(valeur instanceof Manquant);
}

function entierOu(args: Argument[], index: number, nom: string, defaut: number): number {
  const valeur = prendre(args, index, nom);
  return fourni(valeur) ? enEntier(valeur) : defaut;
}

// ——— Adresses ———

export function lettresColonne(colonne: number): string {
  let lettres = "";
  let n = colonne;
  while (n > 0) {
    const reste = (n - 1) % 26;
    lettres = String.fromCharCode(65 + reste) + lettres;
    n = Math.floor((n - 1) / 26);
  }
  return lettres;
}

export function numeroColonne(lettres: string): number {
  const propre = lettres.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(propre)) throw new ErreurVba(1004);
  let n = 0;
  for (const lettre of propre) n = n * 26 + lettre.charCodeAt(0) - 64;
  if (n > NB_COLONNES) throw new ErreurVba(1004);
  return n;
}

interface Zone {
  l1: number;
  c1: number;
  l2: number;
  c2: number;
}

/** Lit « A1 », « $B$2:D10 », « A:C » ou « 3:5 ». */
export function lireAdresse(adresse: string): Zone {
  const texte = adresse.trim().toUpperCase().replace(/\$/g, "");
  if (texte.includes(",")) {
    throw new ErreurVba(
      1004,
      "Les plages en plusieurs morceaux (« A1,C3 ») ne sont pas prises en charge",
    );
  }
  if (texte.includes("!")) {
    throw new ErreurVba(1004, 'Pour une autre feuille, écris Worksheets("Nom").Range("A1")');
  }
  const [debut = "", fin = debut] = texte.split(":");
  const cellule = /^([A-Z]{1,3})(\d+)$/;
  const a = cellule.exec(debut);
  const b = cellule.exec(fin);
  if (a && b) {
    return normaliser({
      l1: Number(a[2]),
      c1: numeroColonne(a[1] ?? ""),
      l2: Number(b[2]),
      c2: numeroColonne(b[1] ?? ""),
    });
  }
  if (/^[A-Z]{1,3}$/.test(debut) && /^[A-Z]{1,3}$/.test(fin)) {
    return normaliser({ l1: 1, c1: numeroColonne(debut), l2: NB_LIGNES, c2: numeroColonne(fin) });
  }
  if (/^\d+$/.test(debut) && /^\d+$/.test(fin)) {
    return normaliser({ l1: Number(debut), c1: 1, l2: Number(fin), c2: NB_COLONNES });
  }
  throw new ErreurVba(1004, `Adresse de plage incorrecte : « ${adresse} »`);
}

function normaliser(zone: Zone): Zone {
  const resultat = {
    l1: Math.min(zone.l1, zone.l2),
    c1: Math.min(zone.c1, zone.c2),
    l2: Math.max(zone.l1, zone.l2),
    c2: Math.max(zone.c1, zone.c2),
  };
  if (resultat.l1 < 1 || resultat.c1 < 1 || resultat.l2 > NB_LIGNES || resultat.c2 > NB_COLONNES) {
    throw new ErreurVba(1004);
  }
  return resultat;
}

// ——— Cellules et feuilles ———

export interface Cellule {
  valeur: Valeur;
  /** La formule de la cellule : sa valeur est alors calculée à chaque lecture. */
  formule: NoeudFormule | null;
  gras: boolean;
  italique: boolean;
  souligne: boolean;
  couleurTexte: number | null;
  couleurFond: number | null;
  format: string | null;
}

function celluleVide(): Cellule {
  return {
    valeur: undefined,
    formule: null,
    gras: false,
    italique: false,
    souligne: false,
    couleurTexte: null,
    couleurFond: null,
    format: null,
  };
}

function estVide(cellule: Cellule | undefined): boolean {
  if (cellule === undefined) return true;
  return cellule.formule === null && (cellule.valeur === undefined || cellule.valeur === "");
}

function aUnFormat(cellule: Cellule): boolean {
  return (
    cellule.gras ||
    cellule.italique ||
    cellule.souligne ||
    cellule.couleurTexte !== null ||
    cellule.couleurFond !== null ||
    cellule.format !== null
  );
}

/** Un texte qui commence par « = » est une formule (« = » seul reste un texte). */
function estFormule(valeur: Valeur): valeur is string {
  return typeof valeur === "string" && valeur.startsWith("=") && valeur.length > 1;
}

/** Ce qu'Excel range dans une cellule quand on lui donne une valeur. */
function valeurDeCellule(valeur: Valeur): Valeur {
  const v = simple(valeur);
  if (typeof v === "string") {
    if (v.startsWith("'")) return v.slice(1);
    // Excel transforme en nombre un texte qui en est un (« 12 », « 3,5 »).
    if (/^\s*-?\d+(,\d+)?\s*$/.test(v)) return lireNombre(v);
    return v === "" ? undefined : v;
  }
  if (v instanceof TableauVba || v instanceof ObjetVba) throw new ErreurVba(13);
  return v;
}

export class Feuille extends ObjetVba {
  readonly nomType = "Worksheet";
  readonly cellules = new Map<number, Cellule>();
  readonly classeur: Classeur;
  nom: string;

  constructor(classeur: Classeur, nom: string) {
    super();
    this.classeur = classeur;
    this.nom = nom;
  }

  private cle(ligne: number, colonne: number): number {
    return (ligne - 1) * NB_COLONNES + (colonne - 1);
  }

  cellule(ligne: number, colonne: number): Cellule | undefined {
    return this.cellules.get(this.cle(ligne, colonne));
  }

  modifiable(ligne: number, colonne: number): Cellule {
    const cle = this.cle(ligne, colonne);
    let cellule = this.cellules.get(cle);
    if (!cellule) {
      cellule = celluleVide();
      this.cellules.set(cle, cellule);
    }
    return cellule;
  }

  /** La valeur de la cellule : celle d'une formule est calculée. */
  valeur(ligne: number, colonne: number): Valeur {
    const cellule = this.cellule(ligne, colonne);
    if (cellule?.formule) return this.classeur.calculer(this, ligne, colonne, cellule.formule);
    return cellule?.valeur;
  }

  estVide(ligne: number, colonne: number): boolean {
    return estVide(this.cellule(ligne, colonne));
  }

  /** Écrit une valeur. Un texte qui commence par « = » est une formule, lue dans la syntaxe donnée. */
  definir(ligne: number, colonne: number, valeur: Valeur, syntaxe: Syntaxe = "a1"): void {
    const brute = simple(valeur);
    if (estFormule(brute)) {
      const hote = { ligne, colonne };
      this.definirFormule(ligne, colonne, analyserFormule(brute.slice(1), syntaxe, hote));
      return;
    }
    const v = valeurDeCellule(brute);
    if (v === undefined) {
      const cellule = this.cellule(ligne, colonne);
      if (cellule) {
        cellule.valeur = undefined;
        cellule.formule = null;
      }
      return;
    }
    const cellule = this.modifiable(ligne, colonne);
    cellule.valeur = v;
    cellule.formule = null;
  }

  definirFormule(ligne: number, colonne: number, formule: NoeudFormule): void {
    const cellule = this.modifiable(ligne, colonne);
    cellule.formule = formule;
    cellule.valeur = undefined;
  }

  /** La formule d'une cellule dans la syntaxe demandée, sinon sa valeur (Range.Formula). */
  formule(ligne: number, colonne: number, syntaxe: Syntaxe): Valeur {
    const cellule = this.cellule(ligne, colonne);
    if (cellule?.formule) return ecrireFormule(cellule.formule, syntaxe, { ligne, colonne });
    return cellule?.valeur ?? "";
  }

  /** Les cellules non vides, avec leur position. */
  *remplies(): Generator<{ ligne: number; colonne: number; cellule: Cellule }> {
    for (const [cle, cellule] of this.cellules) {
      if (estVide(cellule) && !aUnFormat(cellule)) continue;
      yield { ligne: Math.floor(cle / NB_COLONNES) + 1, colonne: (cle % NB_COLONNES) + 1, cellule };
    }
  }

  effacer(zone: Zone, contenu: boolean, formats: boolean): void {
    for (const [cle, cellule] of [...this.cellules]) {
      const ligne = Math.floor(cle / NB_COLONNES) + 1;
      const colonne = (cle % NB_COLONNES) + 1;
      if (ligne < zone.l1 || ligne > zone.l2 || colonne < zone.c1 || colonne > zone.c2) continue;
      if (contenu) {
        cellule.valeur = undefined;
        cellule.formule = null;
      }
      if (formats) {
        Object.assign(cellule, {
          ...celluleVide(),
          valeur: cellule.valeur,
          formule: cellule.formule,
        });
      }
      if (estVide(cellule) && !aUnFormat(cellule)) this.cellules.delete(cle);
    }
  }

  /** Supprime ou insère les lignes (ou les colonnes) de la zone, en décalant les suivantes. */
  decaler(zone: Zone, sens: "lignes" | "colonnes", suppression: boolean): void {
    const anciennes = [...this.cellules];
    const taille = sens === "lignes" ? zone.l2 - zone.l1 + 1 : zone.c2 - zone.c1 + 1;
    const retirees: number[] = [];
    const deplacees: [number, Cellule][] = [];
    for (const [cle, cellule] of anciennes) {
      let ligne = Math.floor(cle / NB_COLONNES) + 1;
      let colonne = (cle % NB_COLONNES) + 1;
      const dansBande =
        sens === "lignes"
          ? colonne >= zone.c1 && colonne <= zone.c2
          : ligne >= zone.l1 && ligne <= zone.l2;
      if (!dansBande) continue;
      retirees.push(cle);
      const position = sens === "lignes" ? ligne : colonne;
      const debut = sens === "lignes" ? zone.l1 : zone.c1;
      const fin = sens === "lignes" ? zone.l2 : zone.c2;
      let nouvelle = position;
      if (suppression) {
        if (position >= debut && position <= fin) continue;
        if (position > fin) nouvelle = position - taille;
      } else if (position >= debut) {
        nouvelle = position + taille;
      }
      if (sens === "lignes") ligne = nouvelle;
      else colonne = nouvelle;
      if (ligne > NB_LIGNES || colonne > NB_COLONNES) continue;
      deplacees.push([this.cle(ligne, colonne), cellule]);
    }
    // On retire d'abord toute la bande, puis on replace : un déplacement n'écrase rien.
    for (const cle of retirees) this.cellules.delete(cle);
    for (const [cle, cellule] of deplacees) this.cellules.set(cle, cellule);
  }

  plage(zone: Zone, mode: ModePlage = "cellules"): Plage {
    return new Plage(this, normaliser(zone), mode);
  }

  /** Range("A1"), Range("A1:B2"), Range(Cells(1, 1), Cells(2, 2)) */
  range(args: Argument[], base?: Plage): Plage {
    const premier = prendre(args, 0, "cell1");
    const second = prendre(args, 1, "cell2");
    if (!fourni(premier)) throw new ErreurVba(449);
    let zone = this.zoneDe(premier);
    if (base) {
      zone = {
        l1: zone.l1 + base.zone.l1 - 1,
        c1: zone.c1 + base.zone.c1 - 1,
        l2: zone.l2 + base.zone.l1 - 1,
        c2: zone.c2 + base.zone.c1 - 1,
      };
    }
    if (fourni(second)) {
      const autre = this.zoneDe(second);
      zone = {
        l1: Math.min(zone.l1, autre.l1),
        c1: Math.min(zone.c1, autre.c1),
        l2: Math.max(zone.l2, autre.l2),
        c2: Math.max(zone.c2, autre.c2),
      };
    }
    return this.plage(zone);
  }

  private zoneDe(valeur: Valeur): Zone {
    if (valeur instanceof Plage) {
      if (valeur.feuille !== this) throw new ErreurVba(1004);
      return valeur.zone;
    }
    return lireAdresse(enTexte(valeur));
  }

  /** Cells(ligne, colonne), à partir du coin d'une plage. La colonne peut être une lettre. */
  cells(args: Argument[], base: Zone, mode: ModePlage = "cellules"): Plage {
    const ligne = prendre(args, 0, "rowindex");
    const colonne = prendre(args, 1, "columnindex");
    if (!fourni(ligne)) return this.plage(base, mode);
    const largeur = base.c2 - base.c1 + 1;
    if (!fourni(colonne)) {
      // Cells(n) : la n-ième cellule, ligne par ligne.
      const n = enEntier(ligne) - 1;
      const l = base.l1 + Math.floor(n / largeur);
      const c = base.c1 + (n % largeur);
      return this.plage({ l1: l, c1: c, l2: l, c2: c });
    }
    const v = simple(colonne);
    const c = typeof v === "string" && !estNumerique(v) ? numeroColonne(v) : enEntier(v);
    const l = base.l1 + enEntier(ligne) - 1;
    const col = base.c1 + c - 1;
    return this.plage({ l1: l, c1: col, l2: l, c2: col });
  }

  zoneUtilisee(): Zone {
    let zone: Zone | null = null;
    for (const { ligne, colonne } of this.remplies()) {
      zone = zone
        ? {
            l1: Math.min(zone.l1, ligne),
            c1: Math.min(zone.c1, colonne),
            l2: Math.max(zone.l2, ligne),
            c2: Math.max(zone.c2, colonne),
          }
        : { l1: ligne, c1: colonne, l2: ligne, c2: colonne };
    }
    return zone ?? { l1: 1, c1: 1, l2: 1, c2: 1 };
  }

  private entieres(args: Argument[], sens: "lignes" | "colonnes"): Plage {
    const index = prendre(args, 0, "index");
    if (!fourni(index)) {
      return this.plage({ l1: 1, c1: 1, l2: NB_LIGNES, c2: NB_COLONNES }, sens);
    }
    const v = simple(index);
    if (typeof v === "string" && !estNumerique(v)) {
      const zone = lireAdresse(v.includes(":") ? v : `${v}:${v}`);
      return this.plage(zone, sens);
    }
    const n = enEntier(v);
    return sens === "lignes"
      ? this.plage({ l1: n, c1: 1, l2: n, c2: NB_COLONNES }, sens)
      : this.plage({ l1: 1, c1: n, l2: NB_LIGNES, c2: n }, sens);
  }

  override lire(nom: string, args: Argument[]): Valeur {
    const toute = { l1: 1, c1: 1, l2: NB_LIGNES, c2: NB_COLONNES };
    switch (nom) {
      case "name":
      case "codename":
        return this.nom;
      case "range":
        return this.range(args);
      case "cells":
        return this.cells(args, toute);
      case "rows":
        return this.entieres(args, "lignes");
      case "columns":
        return this.entieres(args, "colonnes");
      case "usedrange":
        return this.plage(this.zoneUtilisee());
      case "activate":
      case "select":
        this.classeur.active = this;
        return undefined;
      case "index":
        return this.classeur.feuilles.indexOf(this) + 1;
      case "delete":
        this.classeur.supprimer(this);
        return undefined;
      case "visible":
        return true;
      case "parent":
        return this.classeur;
      case "calculate":
      case "protect":
      case "unprotect":
        return undefined;
    }
    return super.lire(nom, args);
  }

  override ecrire(nom: string, args: Argument[], valeur: Valeur): void {
    if (nom === "name") {
      this.classeur.renommer(this, enTexte(valeur));
      return;
    }
    if (nom === "visible") return;
    super.ecrire(nom, args, valeur);
  }
}

// ——— Plages ———

/** Une plage obtenue par .Rows ou .Columns se compte et se parcourt par lignes ou par colonnes. */
type ModePlage = "cellules" | "lignes" | "colonnes";

export class Plage extends ObjetVba {
  readonly nomType = "Range";
  readonly feuille: Feuille;
  readonly zone: Zone;
  readonly mode: ModePlage;

  constructor(feuille: Feuille, zone: Zone, mode: ModePlage = "cellules") {
    super();
    this.feuille = feuille;
    this.zone = zone;
    this.mode = mode;
  }

  get nbLignes(): number {
    return this.zone.l2 - this.zone.l1 + 1;
  }

  get nbColonnes(): number {
    return this.zone.c2 - this.zone.c1 + 1;
  }

  private verifierTaille(): void {
    if (this.nbLignes * this.nbColonnes > TAILLE_MAX) {
      throw new ErreurVba(
        1004,
        "Cette plage est trop grande : limite-toi à la zone utile (UsedRange)",
      );
    }
  }

  private premiere(): Cellule | undefined {
    return this.feuille.cellule(this.zone.l1, this.zone.c1);
  }

  valeur(): Valeur {
    if (this.nbLignes === 1 && this.nbColonnes === 1) {
      return this.feuille.valeur(this.zone.l1, this.zone.c1);
    }
    this.verifierTaille();
    const tableau = new TableauVba(
      [
        [1, this.nbLignes],
        [1, this.nbColonnes],
      ],
      "variant",
    );
    for (let l = 1; l <= this.nbLignes; l++) {
      for (let c = 1; c <= this.nbColonnes; c++) {
        tableau.donnees[tableau.position([l, c])] = this.feuille.valeur(
          this.zone.l1 + l - 1,
          this.zone.c1 + c - 1,
        );
      }
    }
    return tableau;
  }

  /** Value ou Formula. Une même formule donnée à toute une plage s'y recopie, en relatif. */
  affecter(valeur: Valeur, syntaxe: Syntaxe = "a1"): void {
    const v = valeur instanceof Plage ? valeur.valeur() : simple(valeur);
    const { l1, c1 } = this.zone;
    if (estFormule(v)) {
      const formule = analyserFormule(v.slice(1), syntaxe, { ligne: l1, colonne: c1 });
      this.verifierTaille();
      for (let l = 0; l < this.nbLignes; l++) {
        for (let c = 0; c < this.nbColonnes; c++)
          this.feuille.definirFormule(l1 + l, c1 + c, formule);
      }
      return;
    }
    if (v instanceof TableauVba) {
      this.verifierTaille();
      const [lignes, colonnes] = v.bornes;
      for (let l = 0; l < this.nbLignes; l++) {
        for (let c = 0; c < this.nbColonnes; c++) {
          let element: Valeur = "#N/A";
          if (v.bornes.length === 1 && lignes) {
            const indice = lignes[0] + c;
            if (indice <= lignes[1]) element = v.lire([indice]);
          } else if (v.bornes.length === 2 && lignes && colonnes) {
            const il = lignes[0] + l;
            const ic = colonnes[0] + c;
            if (il <= lignes[1] && ic <= colonnes[1]) element = v.lire([il, ic]);
          } else {
            throw new ErreurVba(13);
          }
          this.feuille.definir(l1 + l, c1 + c, element, syntaxe);
        }
      }
      return;
    }
    if (valeurDeCellule(v) === undefined) {
      this.feuille.effacer(this.zone, true, false);
      return;
    }
    this.verifierTaille();
    for (let l = 0; l < this.nbLignes; l++) {
      for (let c = 0; c < this.nbColonnes; c++) this.feuille.definir(l1 + l, c1 + c, v);
    }
  }

  private decalee(lignes: number, colonnes: number): Plage {
    const { l1, c1, l2, c2 } = this.zone;
    return this.feuille.plage({
      l1: l1 + lignes,
      c1: c1 + colonnes,
      l2: l2 + lignes,
      c2: c2 + colonnes,
    });
  }

  private adresse(args: Argument[]): string {
    const ligneAbsolue = prendre(args, 0, "rowabsolute");
    const colonneAbsolue = prendre(args, 1, "columnabsolute");
    const dl = !fourni(ligneAbsolue) || enBooleen(ligneAbsolue) ? "$" : "";
    const dc = !fourni(colonneAbsolue) || enBooleen(colonneAbsolue) ? "$" : "";
    const cellule = (l: number, c: number) => `${dc}${lettresColonne(c)}${dl}${String(l)}`;
    const { l1, c1, l2, c2 } = this.zone;
    if (c1 === 1 && c2 === NB_COLONNES) return `${dl}${String(l1)}:${dl}${String(l2)}`;
    if (l1 === 1 && l2 === NB_LIGNES)
      return `${dc}${lettresColonne(c1)}:${dc}${lettresColonne(c2)}`;
    if (l1 === l2 && c1 === c2) return cellule(l1, c1);
    return `${cellule(l1, c1)}:${cellule(l2, c2)}`;
  }

  /** End(xlUp), End(xlDown)… : comme Ctrl+flèche dans Excel. */
  private fin(direction: number): Plage {
    const { l1, c1 } = this.zone;
    const vertical = direction === XL.up || direction === XL.down;
    const pas = direction === XL.down || direction === XL.toRight ? 1 : -1;
    if (!vertical && direction !== XL.toLeft && direction !== XL.toRight) throw new ErreurVba(1004);
    const positions = new Set<number>();
    for (const { ligne, colonne, cellule } of this.feuille.remplies()) {
      if (estVide(cellule)) continue;
      if (vertical && colonne === c1) positions.add(ligne);
      if (!vertical && ligne === l1) positions.add(colonne);
    }
    const depart = vertical ? l1 : c1;
    const max = vertical ? NB_LIGNES : NB_COLONNES;
    const dedans = (p: number) => p >= 1 && p <= max;
    let arrivee = depart;
    const suivant = depart + pas;
    if (dedans(suivant)) {
      if (positions.has(depart) && positions.has(suivant)) {
        arrivee = suivant;
        while (dedans(arrivee + pas) && positions.has(arrivee + pas)) arrivee += pas;
      } else {
        const candidats = [...positions].filter((p) => (pas > 0 ? p >= suivant : p <= suivant));
        if (candidats.length === 0) arrivee = pas > 0 ? max : 1;
        else arrivee = pas > 0 ? Math.min(...candidats) : Math.max(...candidats);
      }
    }
    const l = vertical ? arrivee : l1;
    const c = vertical ? c1 : arrivee;
    return this.feuille.plage({ l1: l, c1: c, l2: l, c2: c });
  }

  /** CurrentRegion : le bloc de cellules non vides autour de la cellule. */
  private region(): Plage {
    const zone = { ...this.zone };
    const rempli = (l: number, c: number) =>
      l >= 1 && c >= 1 && l <= NB_LIGNES && c <= NB_COLONNES && !this.feuille.estVide(l, c);
    let change = true;
    while (change) {
      change = false;
      for (let c = zone.c1 - 1; c <= zone.c2 + 1; c++) {
        if (rempli(zone.l1 - 1, c)) {
          zone.l1--;
          change = true;
          break;
        }
      }
      for (let c = zone.c1 - 1; c <= zone.c2 + 1; c++) {
        if (rempli(zone.l2 + 1, c)) {
          zone.l2++;
          change = true;
          break;
        }
      }
      for (let l = zone.l1 - 1; l <= zone.l2 + 1; l++) {
        if (rempli(l, zone.c1 - 1)) {
          zone.c1--;
          change = true;
          break;
        }
      }
      for (let l = zone.l1 - 1; l <= zone.l2 + 1; l++) {
        if (rempli(l, zone.c2 + 1)) {
          zone.c2++;
          change = true;
          break;
        }
      }
    }
    return this.feuille.plage(zone);
  }

  private entiere(sens: "lignes" | "colonnes"): Plage {
    const { l1, c1, l2, c2 } = this.zone;
    return sens === "lignes"
      ? this.feuille.plage({ l1, c1: 1, l2, c2: NB_COLONNES }, "lignes")
      : this.feuille.plage({ l1: 1, c1, l2: NB_LIGNES, c2 }, "colonnes");
  }

  private sousPlage(sens: "lignes" | "colonnes", args: Argument[]): Plage {
    const index = prendre(args, 0, "index");
    const { l1, c1, l2, c2 } = this.zone;
    if (!fourni(index)) return this.feuille.plage(this.zone, sens);
    const n = enEntier(index);
    if (sens === "lignes")
      return this.feuille.plage({ l1: l1 + n - 1, c1, l2: l1 + n - 1, c2 }, sens);
    return this.feuille.plage({ l1, c1: c1 + n - 1, l2, c2: c1 + n - 1 }, sens);
  }

  private element(args: Argument[]): Plage {
    if (this.mode !== "cellules" && args.length === 1) {
      return this.sousPlage(this.mode, args);
    }
    return this.feuille.cells(args, this.zone);
  }

  private chercher(args: Argument[]): Valeur {
    const quoi = prendre(args, 0, "what");
    if (!fourni(quoi)) throw new ErreurVba(449);
    const recherche = enTexte(quoi).toLowerCase();
    const mode = prendre(args, 4, "lookat");
    const entier = fourni(mode) && enEntier(mode) === XL.whole;
    const trouvees: { ligne: number; colonne: number }[] = [];
    for (const { ligne, colonne, cellule } of this.feuille.remplies()) {
      const { l1, c1, l2, c2 } = this.zone;
      if (ligne < l1 || ligne > l2 || colonne < c1 || colonne > c2 || estVide(cellule)) continue;
      const texte = texteCellule(this.feuille.valeur(ligne, colonne), cellule.format).toLowerCase();
      if (entier ? texte === recherche : texte.includes(recherche))
        trouvees.push({ ligne, colonne });
    }
    trouvees.sort((a, b) => a.ligne - b.ligne || a.colonne - b.colonne);
    const premiere = trouvees[0];
    if (!premiere) return RIEN;
    return this.feuille.plage({
      l1: premiere.ligne,
      c1: premiere.colonne,
      l2: premiere.ligne,
      c2: premiere.colonne,
    });
  }

  private supprimerOuInserer(args: Argument[], suppression: boolean): void {
    const { l1, c1, l2, c2 } = this.zone;
    const decalage = prendre(args, 0, "shift");
    let sens: "lignes" | "colonnes" = "lignes";
    if (this.mode === "colonnes" || (l1 === 1 && l2 === NB_LIGNES)) sens = "colonnes";
    else if (this.mode === "lignes" || (c1 === 1 && c2 === NB_COLONNES)) sens = "lignes";
    else if (fourni(decalage)) {
      const d = enEntier(decalage);
      sens = d === XL.toLeft || d === XL.toRight ? "colonnes" : "lignes";
    }
    this.feuille.decaler(this.zone, sens, suppression);
  }

  private copier(args: Argument[]): void {
    const destination = prendre(args, 0, "destination");
    if (!fourni(destination)) {
      this.feuille.classeur.pressePapiers = this;
      return;
    }
    if (!(destination instanceof Plage)) throw new ErreurVba(424);
    destination.coller(this, true);
  }

  coller(source: Plage, avecFormats: boolean): void {
    source.verifierTaille();
    // Une formule copiée garde ses décalages : ses références relatives suivent, comme dans Excel.
    const copies: { l: number; c: number; cellule: Cellule | undefined; valeur: Valeur }[] = [];
    for (let l = 0; l < source.nbLignes; l++) {
      for (let c = 0; c < source.nbColonnes; c++) {
        const ligne = source.zone.l1 + l;
        const colonne = source.zone.c1 + c;
        const cellule = source.feuille.cellule(ligne, colonne);
        const valeur = source.feuille.valeur(ligne, colonne);
        copies.push({ l, c, cellule: cellule ? { ...cellule } : undefined, valeur });
      }
    }
    for (const { l, c, cellule, valeur } of copies) {
      const ligne = this.zone.l1 + l;
      const colonne = this.zone.c1 + c;
      if (ligne > NB_LIGNES || colonne > NB_COLONNES) continue;
      if (avecFormats) {
        if (cellule) Object.assign(this.feuille.modifiable(ligne, colonne), cellule);
        else this.feuille.effacer({ l1: ligne, c1: colonne, l2: ligne, c2: colonne }, true, true);
      } else {
        this.feuille.definir(ligne, colonne, valeur);
      }
    }
  }

  private pourChaqueCellule(action: (cellule: Cellule) => void): void {
    this.verifierTaille();
    for (let l = this.zone.l1; l <= this.zone.l2; l++) {
      for (let c = this.zone.c1; c <= this.zone.c2; c++) action(this.feuille.modifiable(l, c));
    }
  }

  modifierFormat(action: (cellule: Cellule) => void): void {
    this.pourChaqueCellule(action);
  }

  /** Range.Formula : la formule d'une cellule, ou un tableau des formules de la plage. */
  private formules(syntaxe: Syntaxe): Valeur {
    const { l1, c1 } = this.zone;
    if (this.nbLignes === 1 && this.nbColonnes === 1) return this.feuille.formule(l1, c1, syntaxe);
    this.verifierTaille();
    const tableau = new TableauVba(
      [
        [1, this.nbLignes],
        [1, this.nbColonnes],
      ],
      "variant",
    );
    for (let l = 1; l <= this.nbLignes; l++) {
      for (let c = 1; c <= this.nbColonnes; c++) {
        tableau.donnees[tableau.position([l, c])] = this.feuille.formule(
          l1 + l - 1,
          c1 + c - 1,
          syntaxe,
        );
      }
    }
    return tableau;
  }

  premiereCellule(): Cellule | undefined {
    return this.premiere();
  }

  override lire(nom: string, args: Argument[]): Valeur {
    switch (nom) {
      case "":
        return args.length > 0 ? this.element(args) : this.valeur();
      case "value":
      case "value2":
        return this.valeur();
      case "formula":
        return this.formules("a1");
      case "formulalocal":
        return this.formules("local");
      case "formular1c1":
        return this.formules("r1c1");
      case "text":
        return texteCellule(
          this.feuille.valeur(this.zone.l1, this.zone.c1),
          this.premiere()?.format ?? null,
        );
      case "row":
        return this.zone.l1;
      case "column":
        return this.zone.c1;
      case "count":
      case "countlarge":
        if (this.mode === "lignes") return this.nbLignes;
        if (this.mode === "colonnes") return this.nbColonnes;
        return this.nbLignes * this.nbColonnes;
      case "rows":
        return this.sousPlage("lignes", args);
      case "columns":
        return this.sousPlage("colonnes", args);
      case "cells":
        return args.length > 0
          ? this.feuille.cells(args, this.zone)
          : this.feuille.plage(this.zone);
      case "item":
        return this.element(args);
      case "range":
        return this.feuille.range(args, this);
      case "offset":
        return this.decalee(
          entierOu(args, 0, "rowoffset", 0),
          entierOu(args, 1, "columnoffset", 0),
        );
      case "resize": {
        const { l1, c1 } = this.zone;
        const lignes = entierOu(args, 0, "rowsize", this.nbLignes);
        const colonnes = entierOu(args, 1, "columnsize", this.nbColonnes);
        if (lignes < 1 || colonnes < 1) throw new ErreurVba(1004);
        return this.feuille.plage({ l1, c1, l2: l1 + lignes - 1, c2: c1 + colonnes - 1 });
      }
      case "end":
        return this.fin(entierOu(args, 0, "direction", XL.down));
      case "address":
        return this.adresse(args);
      case "entirerow":
        return this.entiere("lignes");
      case "entirecolumn":
        return this.entiere("colonnes");
      case "currentregion":
        return this.region();
      case "select":
      case "activate":
        this.feuille.classeur.active = this.feuille;
        this.feuille.classeur.selection = this;
        return undefined;
      case "clearcontents":
        this.feuille.effacer(this.zone, true, false);
        return undefined;
      case "clear":
        this.feuille.effacer(this.zone, true, true);
        return undefined;
      case "clearformats":
        this.feuille.effacer(this.zone, false, true);
        return undefined;
      case "delete":
        this.supprimerOuInserer(args, true);
        return undefined;
      case "insert":
        this.supprimerOuInserer(args, false);
        return undefined;
      case "copy":
        this.copier(args);
        return undefined;
      case "pastespecial": {
        const source = this.feuille.classeur.pressePapiers;
        if (!source) throw new ErreurVba(1004, "Rien à coller : utilise d'abord .Copy");
        this.coller(source, false);
        return undefined;
      }
      case "find":
        return this.chercher(args);
      case "font":
        return new Police(this);
      case "interior":
        return new Interieur(this);
      case "numberformat":
      case "numberformatlocal":
        return this.premiere()?.format ?? "General";
      case "hasformula":
        return (this.premiere()?.formule ?? null) !== null;
      case "worksheet":
      case "parent":
        return this.feuille;
      case "autofit":
      case "merge":
      case "unmerge":
      case "calculate":
        return undefined;
      case "columnwidth":
        return 10.71;
      case "rowheight":
        return 15;
      case "horizontalalignment":
      case "verticalalignment":
        return 1;
      case "wraptext":
        return false;
      case "sort":
      case "autofilter":
      case "specialcells":
        throw new ErreurVba(438, `Range.${nom} n'est pas encore pris en charge`);
    }
    return super.lire(nom, args);
  }

  override ecrire(nom: string, args: Argument[], valeur: Valeur): void {
    switch (nom) {
      case "":
        if (args.length > 0) this.element(args).affecter(valeur);
        else this.affecter(valeur);
        return;
      case "value":
      case "value2":
      case "formula":
        this.affecter(valeur);
        return;
      case "formulalocal":
        this.affecter(valeur, "local");
        return;
      case "formular1c1":
        this.affecter(valeur, "r1c1");
        return;
      case "numberformat":
      case "numberformatlocal": {
        const format = enTexte(valeur);
        this.pourChaqueCellule((cellule) => {
          cellule.format = format;
        });
        return;
      }
      case "columnwidth":
      case "rowheight":
      case "horizontalalignment":
      case "verticalalignment":
      case "wraptext":
        return;
    }
    super.ecrire(nom, args, valeur);
  }

  override elements(): Valeur[] {
    if (this.mode === "lignes") {
      return Array.from({ length: this.nbLignes }, (_, i) =>
        this.feuille.plage({ ...this.zone, l1: this.zone.l1 + i, l2: this.zone.l1 + i }, "lignes"),
      );
    }
    if (this.mode === "colonnes") {
      return Array.from({ length: this.nbColonnes }, (_, i) =>
        this.feuille.plage(
          { ...this.zone, c1: this.zone.c1 + i, c2: this.zone.c1 + i },
          "colonnes",
        ),
      );
    }
    this.verifierTaille();
    const cellules: Valeur[] = [];
    for (let l = this.zone.l1; l <= this.zone.l2; l++) {
      for (let c = this.zone.c1; c <= this.zone.c2; c++) {
        cellules.push(this.feuille.plage({ l1: l, c1: c, l2: l, c2: c }));
      }
    }
    return cellules;
  }

  override defaut(): Valeur {
    return this.valeur();
  }
}

/** Range.Font : gras, italique, couleur… */
class Police extends ObjetVba {
  readonly nomType = "Font";

  private readonly plage: Plage;

  constructor(plage: Plage) {
    super();
    this.plage = plage;
  }

  override lire(nom: string, args: Argument[]): Valeur {
    const cellule = this.plage.premiereCellule();
    switch (nom) {
      case "bold":
        return cellule?.gras ?? false;
      case "italic":
        return cellule?.italique ?? false;
      case "underline":
        return cellule?.souligne ? 2 : -4142;
      case "color":
        return cellule?.couleurTexte ?? 0;
      case "size":
        return 11;
      case "name":
        return "Calibri";
    }
    return super.lire(nom, args);
  }

  override ecrire(nom: string, args: Argument[], valeur: Valeur): void {
    switch (nom) {
      case "bold": {
        const gras = enBooleen(valeur);
        this.plage.modifierFormat((cellule) => {
          cellule.gras = gras;
        });
        return;
      }
      case "italic": {
        const italique = enBooleen(valeur);
        this.plage.modifierFormat((cellule) => {
          cellule.italique = italique;
        });
        return;
      }
      case "underline": {
        const souligne = enNombre(valeur) > 0 || valeur === true;
        this.plage.modifierFormat((cellule) => {
          cellule.souligne = souligne;
        });
        return;
      }
      case "color":
      case "colorindex": {
        const couleur = enEntier(valeur);
        this.plage.modifierFormat((cellule) => {
          cellule.couleurTexte = couleur;
        });
        return;
      }
      case "size":
      case "name":
        return;
    }
    super.ecrire(nom, args, valeur);
  }
}

/** Range.Interior : la couleur de fond. */
class Interieur extends ObjetVba {
  readonly nomType = "Interior";

  private readonly plage: Plage;

  constructor(plage: Plage) {
    super();
    this.plage = plage;
  }

  override lire(nom: string, args: Argument[]): Valeur {
    if (nom === "color" || nom === "colorindex")
      return this.plage.premiereCellule()?.couleurFond ?? 16777215;
    if (nom === "pattern") return 1;
    return super.lire(nom, args);
  }

  override ecrire(nom: string, args: Argument[], valeur: Valeur): void {
    if (nom === "color" || nom === "colorindex") {
      const couleur = enEntier(valeur);
      const aucune = couleur === -4142 || couleur === 0x7fffffff;
      this.plage.modifierFormat((cellule) => {
        cellule.couleurFond = aucune ? null : couleur;
      });
      return;
    }
    if (nom === "pattern") return;
    super.ecrire(nom, args, valeur);
  }
}

// ——— Classeur ———

export class Feuilles extends ObjetVba {
  readonly nomType = "Sheets";

  private readonly classeur: Classeur;

  constructor(classeur: Classeur) {
    super();
    this.classeur = classeur;
  }

  override lire(nom: string, args: Argument[]): Valeur {
    switch (nom) {
      case "":
      case "item": {
        const index = prendre(args, 0, "index");
        if (!fourni(index)) return this;
        return this.classeur.feuille(index);
      }
      case "count":
        return this.classeur.feuilles.length;
      case "add":
        return this.classeur.ajouter(args);
    }
    return super.lire(nom, args);
  }

  override elements(): Valeur[] {
    return [...this.classeur.feuilles];
  }
}

export class Classeur extends ObjetVba {
  readonly nomType = "Workbook";
  readonly feuilles: Feuille[] = [];
  active: Feuille;
  selection: Plage | null = null;
  pressePapiers: Plage | null = null;
  /** Le moteur de calcul des formules, fourni par l'interpréteur. */
  moteur: MoteurFormules | null = null;

  constructor() {
    super();
    this.active = new Feuille(this, "Feuil1");
    this.feuilles.push(this.active);
  }

  calculer(feuille: Feuille, ligne: number, colonne: number, formule: NoeudFormule): Valeur {
    if (!this.moteur) throw new ErreurVba(1004, "Les formules ne peuvent pas être calculées ici");
    return this.moteur.calculer(feuille, ligne, colonne, formule);
  }

  feuille(index: Valeur): Feuille {
    const v = simple(index);
    if (typeof v === "string") {
      const trouvee = this.feuilles.find((f) => f.nom.toLowerCase() === v.toLowerCase());
      if (!trouvee) {
        throw new ErreurVba(
          9,
          `L'indice n'appartient pas à la sélection : aucune feuille « ${v} »`,
        );
      }
      return trouvee;
    }
    const trouvee = this.feuilles[enEntier(v) - 1];
    if (!trouvee) throw new ErreurVba(9);
    return trouvee;
  }

  ajouter(args: Argument[]): Feuille {
    const avant = prendre(args, 0, "before");
    const apres = prendre(args, 1, "after");
    let numero = this.feuilles.length + 1;
    const noms = new Set(this.feuilles.map((f) => f.nom.toLowerCase()));
    while (noms.has(`feuil${String(numero)}`)) numero++;
    const feuille = new Feuille(this, `Feuil${String(numero)}`);
    let position = this.feuilles.indexOf(this.active);
    if (avant instanceof Feuille) position = this.feuilles.indexOf(avant);
    else if (apres instanceof Feuille) position = this.feuilles.indexOf(apres) + 1;
    this.feuilles.splice(position, 0, feuille);
    this.active = feuille;
    return feuille;
  }

  supprimer(feuille: Feuille): void {
    if (this.feuilles.length === 1) {
      throw new ErreurVba(1004, "Un classeur doit contenir au moins une feuille");
    }
    const position = this.feuilles.indexOf(feuille);
    this.feuilles.splice(position, 1);
    if (this.active === feuille)
      this.active = this.feuilles[Math.max(0, position - 1)] ?? this.active;
  }

  renommer(feuille: Feuille, nom: string): void {
    if (nom === "" || nom.length > 31 || /[\\/?*[\]:]/.test(nom)) {
      throw new ErreurVba(
        1004,
        "Nom de feuille incorrect : 31 caractères au plus, sans \\ / ? * [ ] :",
      );
    }
    const prise = this.feuilles.find(
      (f) => f !== feuille && f.nom.toLowerCase() === nom.toLowerCase(),
    );
    if (prise) throw new ErreurVba(1004, `Une feuille s'appelle déjà « ${nom} »`);
    feuille.nom = nom;
  }

  celluleActive(): Plage {
    const selection = this.selection;
    if (selection && selection.feuille === this.active) {
      const { l1, c1 } = selection.zone;
      return this.active.plage({ l1, c1, l2: l1, c2: c1 });
    }
    return this.active.plage({ l1: 1, c1: 1, l2: 1, c2: 1 });
  }

  override lire(nom: string, args: Argument[]): Valeur {
    switch (nom) {
      case "worksheets":
      case "sheets": {
        const feuilles = new Feuilles(this);
        return args.length > 0 ? feuilles.lire("", args) : feuilles;
      }
      case "activesheet":
        return this.active;
      case "name":
        return "Classeur1.xlsm";
      case "fullname":
        return "Classeur1.xlsm";
      case "path":
        return "";
      case "save":
      case "close":
      case "activate":
        return undefined;
    }
    return super.lire(nom, args);
  }
}

// ——— Fonctions de feuille de calcul (WorksheetFunction) ———

function valeursDe(args: Valeur[]): { valeur: Valeur; directe: boolean }[] {
  const resultat: { valeur: Valeur; directe: boolean }[] = [];
  for (const arg of args) {
    if (arg instanceof Plage) {
      const v = arg.valeur();
      if (v instanceof TableauVba)
        for (const element of v.donnees) resultat.push({ valeur: element, directe: false });
      else resultat.push({ valeur: v, directe: false });
    } else if (arg instanceof TableauVba) {
      for (const element of arg.donnees) resultat.push({ valeur: element, directe: false });
    } else {
      resultat.push({ valeur: simple(arg), directe: true });
    }
  }
  return resultat;
}

/** Les nombres des arguments : dans une plage, les textes et les cellules vides sont ignorés. */
function nombresDe(args: Valeur[]): number[] {
  const nombres: number[] = [];
  for (const { valeur, directe } of valeursDe(args)) {
    if (typeof valeur === "number") nombres.push(valeur);
    else if (valeur instanceof DateVba) nombres.push(valeur.serie);
    else if (directe && valeur !== undefined) nombres.push(enNombre(valeur));
  }
  return nombres;
}

function egalExcel(a: Valeur, b: Valeur): boolean {
  if (a instanceof ErreurExcel || b instanceof ErreurExcel) {
    return a instanceof ErreurExcel && b instanceof ErreurExcel && a.code === b.code;
  }
  if (typeof a === "number" || typeof b === "number") {
    if (estNumerique(a) && estNumerique(b) && a !== undefined && b !== undefined) {
      return enNombre(a) === enNombre(b);
    }
    return false;
  }
  return enTexte(a ?? "").toLowerCase() === enTexte(b ?? "").toLowerCase();
}

/** Critère de NB.SI / SOMME.SI : ">10", "<>Paris", "Pa*"… */
function critere(valeur: Valeur): (cellule: Valeur) => boolean {
  if (typeof valeur !== "string") return (cellule) => egalExcel(cellule, valeur);
  const correspondance = /^(<>|>=|<=|=|>|<)?(.*)$/.exec(valeur);
  const op = correspondance?.[1] ?? "=";
  const cible = correspondance?.[2] ?? "";
  const nombre = lireNombre(cible);
  if (nombre !== null && op !== "=" && op !== "<>") {
    return (cellule) => {
      if (typeof cellule !== "number") return false;
      if (op === ">") return cellule > nombre;
      if (op === "<") return cellule < nombre;
      if (op === ">=") return cellule >= nombre;
      return cellule <= nombre;
    };
  }
  const motif = new RegExp(
    "^" +
      cible
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") +
      "$",
    "i",
  );
  const egal = (cellule: Valeur) =>
    nombre !== null
      ? egalExcel(cellule, nombre)
      : !(cellule instanceof ErreurExcel) &&
        motif.test(cellule === undefined ? "" : texteCellule(cellule, null));
  return op === "<>" ? (cellule) => !egal(cellule) : egal;
}

function cellulesDe(valeur: Valeur): Valeur[] {
  if (valeur instanceof Plage) {
    const v = valeur.valeur();
    return v instanceof TableauVba ? lignesParLignes(v) : [v];
  }
  if (valeur instanceof TableauVba) return lignesParLignes(valeur);
  return [simple(valeur)];
}

/** Les éléments d'un tableau à deux dimensions, ligne par ligne. */
function lignesParLignes(tableau: TableauVba): Valeur[] {
  const [lignes, colonnes] = tableau.bornes;
  if (!lignes) return [];
  if (!colonnes) return [...tableau.donnees];
  const resultat: Valeur[] = [];
  for (let l = lignes[0]; l <= lignes[1]; l++) {
    for (let c = colonnes[0]; c <= colonnes[1]; c++) resultat.push(tableau.lire([l, c]));
  }
  return resultat;
}

function grille(valeur: Valeur): Valeur[][] {
  if (valeur instanceof Plage || valeur instanceof TableauVba) {
    const tableau = valeur instanceof Plage ? valeur.valeur() : valeur;
    if (!(tableau instanceof TableauVba)) return [[tableau]];
    const [lignes, colonnes] = tableau.bornes;
    if (!lignes) return [];
    if (!colonnes) return [[...tableau.donnees]];
    const resultat: Valeur[][] = [];
    for (let l = lignes[0]; l <= lignes[1]; l++) {
      const ligne: Valeur[] = [];
      for (let c = colonnes[0]; c <= colonnes[1]; c++) ligne.push(tableau.lire([l, c]));
      resultat.push(ligne);
    }
    return resultat;
  }
  return [[simple(valeur)]];
}

function arrondiExcel(nombre: number, chiffres: number): number {
  const facteur = 10 ** chiffres;
  return (Math.sign(nombre) * Math.round(Math.abs(nombre) * facteur + 1e-9)) / facteur;
}

export class FonctionsFeuille extends ObjetVba {
  readonly nomType = "WorksheetFunction";

  private echec(nom: string): never {
    throw new ErreurVba(
      1004,
      `Impossible de lire la propriété ${nom} de la classe WorksheetFunction`,
    );
  }

  override lire(nom: string, args: Argument[]): Valeur {
    const valeurs = args.map((arg) => (fourni(arg.valeur) ? arg.valeur : undefined));
    const [a, b, c, d] = valeurs;
    // Comme dans Excel, une cellule en erreur fait échouer le calcul, sauf pour compter.
    const compte = ["count", "counta", "countblank", "countif"].includes(nom);
    if (!compte && valeursDe(valeurs).some(({ valeur }) => valeur instanceof ErreurExcel)) {
      this.echec(nom.charAt(0).toUpperCase() + nom.slice(1));
    }
    switch (nom) {
      case "sum":
        return nombresDe(valeurs).reduce((total, n) => total + n, 0);
      case "product":
        return nombresDe(valeurs).reduce((total, n) => total * n, 1);
      case "average": {
        const nombres = nombresDe(valeurs);
        if (nombres.length === 0) this.echec("Average");
        return nombres.reduce((total, n) => total + n, 0) / nombres.length;
      }
      case "max": {
        const nombres = nombresDe(valeurs);
        return nombres.length ? Math.max(...nombres) : 0;
      }
      case "min": {
        const nombres = nombresDe(valeurs);
        return nombres.length ? Math.min(...nombres) : 0;
      }
      case "median": {
        const nombres = nombresDe(valeurs).sort((x, y) => x - y);
        if (nombres.length === 0) this.echec("Median");
        const milieu = Math.floor(nombres.length / 2);
        return nombres.length % 2
          ? (nombres[milieu] ?? 0)
          : ((nombres[milieu - 1] ?? 0) + (nombres[milieu] ?? 0)) / 2;
      }
      case "large":
      case "small": {
        const nombres = nombresDe([a]).sort((x, y) => (nom === "large" ? y - x : x - y));
        const resultat = nombres[enEntier(b) - 1];
        if (resultat === undefined) this.echec(nom === "large" ? "Large" : "Small");
        return resultat;
      }
      case "count":
        return valeursDe(valeurs).filter(
          ({ valeur, directe }) =>
            typeof valeur === "number" ||
            valeur instanceof DateVba ||
            (directe && estNumerique(valeur) && valeur !== undefined),
        ).length;
      case "counta":
        return valeursDe(valeurs).filter(({ valeur }) => valeur !== undefined && valeur !== "")
          .length;
      case "countblank":
        return valeursDe(valeurs).filter(({ valeur }) => valeur === undefined || valeur === "")
          .length;
      case "countif": {
        const test = critere(simple(b));
        return cellulesDe(a).filter(test).length;
      }
      case "sumif":
      case "averageif": {
        const test = critere(simple(b));
        const cellules = cellulesDe(a);
        const sommes = c !== undefined ? cellulesDe(c) : cellules;
        const retenus = cellules
          .map((cellule, i) => (test(cellule) ? sommes[i] : undefined))
          .filter((v): v is number => typeof v === "number");
        const total = retenus.reduce((somme, n) => somme + n, 0);
        if (nom === "sumif") return total;
        if (retenus.length === 0) this.echec("AverageIf");
        return total / retenus.length;
      }
      case "vlookup": {
        const lignes = grille(b);
        const colonne = enEntier(c);
        const exacte = d !== undefined && !enBooleen(d);
        let trouvee: Valeur[] | undefined;
        if (exacte) trouvee = lignes.find((ligne) => egalExcel(ligne[0], simple(a)));
        else {
          for (const ligne of lignes) {
            if (ligne[0] === undefined) break;
            if (comparerExcel(ligne[0], simple(a)) <= 0) trouvee = ligne;
            else break;
          }
        }
        if (!trouvee || colonne < 1 || colonne > trouvee.length) this.echec("VLookup");
        return trouvee[colonne - 1];
      }
      case "match": {
        const cellules = cellulesDe(b);
        const type = c !== undefined ? enEntier(c) : 1;
        if (type === 0) {
          const position = cellules.findIndex((cellule) => critere(simple(a))(cellule));
          if (position === -1) this.echec("Match");
          return position + 1;
        }
        let position = -1;
        for (const [i, cellule] of cellules.entries()) {
          if (cellule === undefined) break;
          if (comparerExcel(cellule, simple(a)) <= 0) position = i;
          else break;
        }
        if (position === -1) this.echec("Match");
        return position + 1;
      }
      case "index": {
        const lignes = grille(a);
        const l = enEntier(b);
        const col = c !== undefined ? enEntier(c) : 1;
        const ligne = lignes.length === 1 && c === undefined ? lignes[0] : lignes[l - 1];
        const valeur = lignes.length === 1 && c === undefined ? ligne?.[l - 1] : ligne?.[col - 1];
        if (!ligne) this.echec("Index");
        return valeur;
      }
      case "round":
        return arrondiExcel(enNombre(a), b !== undefined ? enEntier(b) : 0);
      case "roundup":
      case "rounddown": {
        const facteur = 10 ** (b !== undefined ? enEntier(b) : 0);
        const n = enNombre(a) * facteur;
        const arrondi =
          nom === "roundup" ? Math.sign(n) * Math.ceil(Math.abs(n) - 1e-9) : Math.trunc(n);
        return arrondi / facteur;
      }
      case "trim":
        return enTexte(a).trim().replace(/ +/g, " ");
      case "proper":
        return enTexte(a)
          .toLowerCase()
          .replace(
            /(^|[^\p{L}])(\p{L})/gu,
            (_, avant: string, lettre: string) => avant + lettre.toUpperCase(),
          );
      case "text":
        return formater(a, enTexte(b));
      case "transpose": {
        const lignes = grille(a);
        const nbLignes = lignes.length;
        const nbColonnes = lignes[0]?.length ?? 0;
        const tableau = new TableauVba(
          [
            [1, nbColonnes],
            [1, nbLignes],
          ],
          "variant",
        );
        lignes.forEach((ligne, l) => {
          ligne.forEach((valeur, col) => {
            tableau.donnees[tableau.position([col + 1, l + 1])] = valeur;
          });
        });
        return tableau;
      }
    }
    return super.lire(nom, args);
  }
}

function comparerExcel(a: Valeur, b: Valeur): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const ta = enTexte(a ?? "").toLowerCase();
  const tb = enTexte(b ?? "").toLowerCase();
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

// ——— Application ———

export class Application extends ObjetVba {
  readonly nomType = "Application";
  private readonly fonctions = new FonctionsFeuille();
  private readonly reglages = new Map<string, Valeur>([
    ["screenupdating", true],
    ["displayalerts", true],
    ["enableevents", true],
    ["calculation", -4105],
    ["statusbar", false],
    ["cutcopymode", false],
  ]);

  private readonly classeur: Classeur;

  constructor(classeur: Classeur) {
    super();
    this.classeur = classeur;
  }

  override lire(nom: string, args: Argument[]): Valeur {
    const reglage = this.reglages.get(nom);
    if (reglage !== undefined) return reglage;
    switch (nom) {
      case "worksheetfunction":
        return this.fonctions;
      case "activeworkbook":
      case "thisworkbook":
        return this.classeur;
      case "activesheet":
        return this.classeur.active;
      case "activecell":
        return this.classeur.celluleActive();
      case "selection":
        return this.classeur.selection ?? this.classeur.celluleActive();
      case "worksheets":
      case "sheets":
      case "range":
      case "cells":
      case "rows":
      case "columns":
        return nom === "worksheets" || nom === "sheets"
          ? this.classeur.lire(nom, args)
          : this.classeur.active.lire(nom, args);
      case "name":
        return "Microsoft Excel";
      case "version":
        return "16.0";
      case "username":
        return "Renard";
      case "wait":
      case "calculate":
        return undefined;
      case "inputbox":
        throw new ErreurVba(
          5,
          "InputBox n'est pas disponible ici : mets la valeur dans une variable",
        );
    }
    return this.fonctions.lire(nom, args);
  }

  override ecrire(nom: string, args: Argument[], valeur: Valeur): void {
    if (this.reglages.has(nom)) {
      this.reglages.set(nom, valeur);
      return;
    }
    super.ecrire(nom, args, valeur);
  }
}

// ——— Collection et Dictionary ———

export class CollectionVba extends ObjetVba {
  readonly nomType = "Collection";
  private readonly elementsRanges: { valeur: Valeur; cle: string | null }[] = [];

  private position(index: Valeur): number {
    const v = simple(index);
    if (typeof v === "string") {
      const position = this.elementsRanges.findIndex((e) => e.cle === v.toLowerCase());
      if (position === -1) throw new ErreurVba(5);
      return position;
    }
    const position = enEntier(v) - 1;
    if (position < 0 || position >= this.elementsRanges.length) throw new ErreurVba(9);
    return position;
  }

  override lire(nom: string, args: Argument[]): Valeur {
    switch (nom) {
      case "":
      case "item": {
        const index = prendre(args, 0, "index");
        if (!fourni(index)) throw new ErreurVba(449);
        return this.elementsRanges[this.position(index)]?.valeur;
      }
      case "count":
        return this.elementsRanges.length;
      case "add": {
        const valeur = prendre(args, 0, "item");
        const cle = prendre(args, 1, "key");
        const avant = prendre(args, 2, "before");
        const apres = prendre(args, 3, "after");
        if (!fourni(valeur)) throw new ErreurVba(449);
        const texteCle = fourni(cle) ? enTexte(cle).toLowerCase() : null;
        if (texteCle !== null && this.elementsRanges.some((e) => e.cle === texteCle)) {
          throw new ErreurVba(457);
        }
        const element = { valeur, cle: texteCle };
        if (fourni(avant)) this.elementsRanges.splice(this.position(avant), 0, element);
        else if (fourni(apres)) this.elementsRanges.splice(this.position(apres) + 1, 0, element);
        else this.elementsRanges.push(element);
        return undefined;
      }
      case "remove": {
        const index = prendre(args, 0, "index");
        if (!fourni(index)) throw new ErreurVba(449);
        this.elementsRanges.splice(this.position(index), 1);
        return undefined;
      }
    }
    return super.lire(nom, args);
  }

  override elements(): Valeur[] {
    return this.elementsRanges.map((e) => e.valeur);
  }
}

export class Dictionnaire extends ObjetVba {
  readonly nomType = "Dictionary";
  private readonly entrees = new Map<string, { cle: Valeur; valeur: Valeur }>();
  private texte = false;

  private cle(valeur: Valeur): string {
    const v = simple(valeur);
    if (typeof v === "string") return "t:" + (this.texte ? v.toLowerCase() : v);
    if (typeof v === "number") return `n:${String(v)}`;
    if (typeof v === "boolean") return `n:${v ? "-1" : "0"}`;
    if (v instanceof DateVba) return `d:${String(v.serie)}`;
    if (v === undefined) return "vide";
    throw new ErreurVba(13);
  }

  private tableau(valeurs: Valeur[]): TableauVba {
    return new TableauVba([[0, valeurs.length - 1]], "variant", valeurs);
  }

  override lire(nom: string, args: Argument[]): Valeur {
    const premier = prendre(args, 0, "key");
    switch (nom) {
      case "":
      case "item": {
        if (!fourni(premier)) throw new ErreurVba(449);
        const cle = this.cle(premier);
        const entree = this.entrees.get(cle);
        if (entree) return entree.valeur;
        // Comme Scripting.Dictionary : lire une clé absente la crée, vide.
        this.entrees.set(cle, { cle: simple(premier), valeur: undefined });
        return undefined;
      }
      case "add": {
        const valeur = prendre(args, 1, "item");
        if (!fourni(premier) || !fourni(valeur)) throw new ErreurVba(449);
        const cle = this.cle(premier);
        if (this.entrees.has(cle)) throw new ErreurVba(457);
        this.entrees.set(cle, { cle: simple(premier), valeur });
        return undefined;
      }
      case "exists":
        if (!fourni(premier)) throw new ErreurVba(449);
        return this.entrees.has(this.cle(premier));
      case "count":
        return this.entrees.size;
      case "keys":
        return this.tableau([...this.entrees.values()].map((e) => e.cle));
      case "items":
        return this.tableau([...this.entrees.values()].map((e) => e.valeur));
      case "remove": {
        if (!fourni(premier)) throw new ErreurVba(449);
        if (!this.entrees.delete(this.cle(premier)))
          throw new ErreurVba(32811, "Élément introuvable");
        return undefined;
      }
      case "removeall":
        this.entrees.clear();
        return undefined;
      case "comparemode":
        return this.texte ? 1 : 0;
    }
    return super.lire(nom, args);
  }

  override ecrire(nom: string, args: Argument[], valeur: Valeur): void {
    if (nom === "" || nom === "item") {
      const cle = prendre(args, 0, "key");
      if (!fourni(cle)) throw new ErreurVba(449);
      this.entrees.set(this.cle(cle), { cle: simple(cle), valeur });
      return;
    }
    if (nom === "comparemode") {
      if (this.entrees.size > 0) throw new ErreurVba(5);
      this.texte = enEntier(valeur) === 1;
      return;
    }
    super.ecrire(nom, args, valeur);
  }

  override elements(): Valeur[] {
    return [...this.entrees.values()].map((e) => e.cle);
  }
}

// ——— Affichage ———

/** Les feuilles non vides, prêtes à être affichées sous l'éditeur. */
export function instantane(classeur: Classeur): FeuilleAffichee[] {
  const feuilles: FeuilleAffichee[] = [];
  for (const feuille of classeur.feuilles) {
    let derniereLigne = 0;
    let derniereColonne = 0;
    for (const { ligne, colonne, cellule } of feuille.remplies()) {
      if (estVide(cellule)) continue;
      derniereLigne = Math.max(derniereLigne, ligne);
      derniereColonne = Math.max(derniereColonne, colonne);
    }
    if (derniereLigne === 0) continue;
    const nbLignes = Math.min(derniereLigne, LIGNES_AFFICHEES);
    const nbColonnes = Math.min(derniereColonne, COLONNES_AFFICHEES);
    const lignes = Array.from({ length: nbLignes }, (_, l) =>
      Array.from({ length: nbColonnes }, (_, c) => {
        const cellule = feuille.cellule(l + 1, c + 1);
        if (!cellule || estVide(cellule)) return null;
        const valeur = feuille.valeur(l + 1, c + 1);
        return {
          texte: texteCellule(valeur, cellule.format),
          gras: cellule.gras,
          italique: cellule.italique,
          nombre: typeof valeur === "number" || valeur instanceof DateVba,
        };
      }),
    );
    feuilles.push({
      nom: feuille.nom,
      lignes,
      tronquee: derniereLigne > nbLignes || derniereColonne > nbColonnes,
    });
  }
  return feuilles;
}
