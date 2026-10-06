/**
 * Les formules Excel : lecture et écriture (ADR 0027).
 *
 * Trois syntaxes, comme dans Excel :
 * - "a1" (Formula) : =SUM(A1:A3, 2.5), en anglais ;
 * - "local" (FormulaLocal) : =SOMME(A1:A3; 2,5), en français ;
 * - "r1c1" (FormulaR1C1) : =SUM(R1C1:R[2]C), comme l'enregistreur de macros.
 *
 * Une référence relative est rangée comme un décalage depuis la cellule de la formule :
 * copier la formule ailleurs la décale donc toute seule, comme dans Excel.
 */
import { ErreurVba } from "./valeurs";

export type Syntaxe = "a1" | "local" | "r1c1";

/** Une ligne ou une colonne : absolue ($A$1), ou décalée depuis la cellule de la formule. */
export interface Coordonnee {
  valeur: number;
  absolue: boolean;
}

export interface Reference {
  feuille: string | null;
  ligne: Coordonnee;
  colonne: Coordonnee;
}

export type NoeudFormule =
  | { k: "nombre"; valeur: number }
  | { k: "texte"; valeur: string }
  | { k: "booleen"; valeur: boolean }
  | { k: "erreur"; code: string }
  /** Argument laissé vide : RECHERCHEV(x; A:B; 2; ) */
  | { k: "vide" }
  | { k: "cellule"; ref: Reference }
  /** A1:B3, ou des colonnes entières (A:B), ou des lignes entières (1:3). */
  | { k: "plage"; debut: Reference; fin: Reference; mode: "cellules" | "colonnes" | "lignes" }
  /** Le nom est celui de la fonction en anglais, en majuscules. */
  | { k: "fonction"; nom: string; args: NoeudFormule[] }
  /** Un nom inconnu : il vaudra #NAME?. */
  | { k: "nom"; nom: string }
  | { k: "unaire"; op: "-" | "+" | "%"; expr: NoeudFormule }
  | { k: "binaire"; op: string; gauche: NoeudFormule; droite: NoeudFormule }
  | { k: "paren"; expr: NoeudFormule };

export interface Hote {
  ligne: number;
  colonne: number;
}

const MAX_LIGNES = 1_048_576;
const MAX_COLONNES = 16_384;

/** Noms français des fonctions (FormulaLocal), à partir des noms anglais. */
export const NOMS_LOCAUX: Record<string, string> = {
  ABS: "ABS",
  AND: "ET",
  AVERAGE: "MOYENNE",
  AVERAGEIF: "MOYENNE.SI",
  CONCAT: "CONCAT",
  CONCATENATE: "CONCATENER",
  COUNT: "NB",
  COUNTA: "NBVAL",
  COUNTBLANK: "NB.VIDE",
  COUNTIF: "NB.SI",
  DATE: "DATE",
  DAY: "JOUR",
  FALSE: "FAUX",
  IF: "SI",
  IFERROR: "SIERREUR",
  IFNA: "SI.NON.DISP",
  INDEX: "INDEX",
  INT: "ENT",
  ISBLANK: "ESTVIDE",
  ISERROR: "ESTERREUR",
  ISNA: "ESTNA",
  ISNUMBER: "ESTNUM",
  ISTEXT: "ESTTEXTE",
  LARGE: "GRANDE.VALEUR",
  LEFT: "GAUCHE",
  LEN: "NBCAR",
  LOWER: "MINUSCULE",
  MATCH: "EQUIV",
  MAX: "MAX",
  MEDIAN: "MEDIANE",
  MID: "STXT",
  MIN: "MIN",
  MOD: "MOD",
  MONTH: "MOIS",
  NA: "NA",
  NOT: "NON",
  NOW: "MAINTENANT",
  OR: "OU",
  PI: "PI",
  POWER: "PUISSANCE",
  PRODUCT: "PRODUIT",
  PROPER: "NOMPROPRE",
  RIGHT: "DROITE",
  ROUND: "ARRONDI",
  ROUNDDOWN: "ARRONDI.INF",
  ROUNDUP: "ARRONDI.SUP",
  SMALL: "PETITE.VALEUR",
  SQRT: "RACINE",
  SUM: "SOMME",
  SUMIF: "SOMME.SI",
  TEXT: "TEXTE",
  TODAY: "AUJOURDHUI",
  TRIM: "SUPPRESPACE",
  TRUE: "VRAI",
  UPPER: "MAJUSCULE",
  VLOOKUP: "RECHERCHEV",
  YEAR: "ANNEE",
};

const NOMS_ANGLAIS: Record<string, string> = Object.fromEntries(
  Object.entries(NOMS_LOCAUX).map(([anglais, local]) => [local, anglais]),
);

/** Codes d'erreur en français, pour FormulaLocal. */
const ERREURS_LOCALES: Record<string, string> = {
  "#VALUE!": "#VALEUR!",
  "#NAME?": "#NOM?",
  "#NULL!": "#NUL!",
};
const ERREURS = ["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A"];

// ——— Lecture ———

type Jeton =
  | { genre: "nombre"; valeur: number }
  | { genre: "texte"; valeur: string }
  | { genre: "erreur"; code: string }
  | { genre: "ref"; noeud: NoeudFormule }
  | { genre: "fonction"; nom: string }
  | { genre: "nom"; nom: string }
  | { genre: "op"; texte: string }
  | { genre: "separateur" }
  | { genre: "ouvrante" }
  | { genre: "fermante" }
  | { genre: "fin" };

function incorrecte(detail: string): never {
  throw new ErreurVba(1004, `Formule incorrecte : ${detail}`);
}

function lettresEnColonne(lettres: string): number {
  let n = 0;
  for (const lettre of lettres.toUpperCase()) n = n * 26 + lettre.charCodeAt(0) - 64;
  return n;
}

const FEUILLE = /^(?:'((?:[^']|'')+)'|([A-Za-z_À-ɏ][\w.À-ɏ]*))!/;
const CELLULE_A1 = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)/;
const COLONNES_A1 = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![\w(])/;
const LIGNES_A1 = /^(\$?)(\d+):(\$?)(\d+)(?![\w.(])/;
const CELLULE_R1C1 = /^[Rr](\[-?\d+\]|\d+)?[Cc](\[-?\d+\]|\d+)?(?![\w(])/;

class Lecteur {
  private position = 0;
  private readonly texte: string;
  private readonly syntaxe: Syntaxe;
  private readonly hote: Hote;

  constructor(texte: string, syntaxe: Syntaxe, hote: Hote) {
    this.texte = texte;
    this.syntaxe = syntaxe;
    this.hote = hote;
  }

  private get reste(): string {
    return this.texte.slice(this.position);
  }

  private coordonneeA1(dollar: string, valeur: number, axe: "ligne" | "colonne"): Coordonnee {
    const max = axe === "ligne" ? MAX_LIGNES : MAX_COLONNES;
    if (valeur < 1 || valeur > max) incorrecte(`référence hors de la feuille`);
    if (dollar === "$") return { valeur, absolue: true };
    return {
      valeur: valeur - (axe === "ligne" ? this.hote.ligne : this.hote.colonne),
      absolue: false,
    };
  }

  private coordonneeR1C1(partie: string | undefined): Coordonnee {
    if (partie === undefined) return { valeur: 0, absolue: false };
    if (partie.startsWith("[")) return { valeur: Number(partie.slice(1, -1)), absolue: false };
    return { valeur: Number(partie), absolue: true };
  }

  /** Une référence (avec sa feuille éventuelle), ou null. */
  private reference(): NoeudFormule | null {
    let reste = this.reste;
    let feuille: string | null = null;
    let longueur = 0;
    const prefixe = FEUILLE.exec(reste);
    if (prefixe) {
      feuille = (prefixe[1] ?? prefixe[2] ?? "").replace(/''/g, "'");
      longueur = prefixe[0].length;
      reste = reste.slice(longueur);
    }

    if (this.syntaxe === "r1c1") {
      const debut = CELLULE_R1C1.exec(reste);
      if (!debut) return prefixe ? incorrecte(`référence attendue après « ${prefixe[0]} »`) : null;
      const ref = (m: RegExpExecArray): Reference => ({
        feuille,
        ligne: this.coordonneeR1C1(m[1]),
        colonne: this.coordonneeR1C1(m[2]),
      });
      longueur += debut[0].length;
      const suite = reste.slice(debut[0].length);
      const fin = suite.startsWith(":") ? CELLULE_R1C1.exec(suite.slice(1)) : null;
      this.position += longueur + (fin ? fin[0].length + 1 : 0);
      if (fin) return { k: "plage", debut: ref(debut), fin: ref(fin), mode: "cellules" };
      return { k: "cellule", ref: ref(debut) };
    }

    const colonnes = COLONNES_A1.exec(reste);
    if (colonnes) {
      const [, d1 = "", c1 = "", d2 = "", c2 = ""] = colonnes;
      this.position += longueur + colonnes[0].length;
      const ligne = { valeur: 1, absolue: true };
      return {
        k: "plage",
        debut: { feuille, ligne, colonne: this.coordonneeA1(d1, lettresEnColonne(c1), "colonne") },
        fin: { feuille, ligne, colonne: this.coordonneeA1(d2, lettresEnColonne(c2), "colonne") },
        mode: "colonnes",
      };
    }
    const lignes = LIGNES_A1.exec(reste);
    if (lignes) {
      const [, d1 = "", l1 = "", d2 = "", l2 = ""] = lignes;
      this.position += longueur + lignes[0].length;
      const colonne = { valeur: 1, absolue: true };
      return {
        k: "plage",
        debut: { feuille, ligne: this.coordonneeA1(d1, Number(l1), "ligne"), colonne },
        fin: { feuille, ligne: this.coordonneeA1(d2, Number(l2), "ligne"), colonne },
        mode: "lignes",
      };
    }
    const debut = CELLULE_A1.exec(reste);
    if (!debut) return prefixe ? incorrecte(`référence attendue après « ${prefixe[0]} »`) : null;
    // LOG10( est une fonction, pas la cellule LOG10.
    if (reste[debut[0].length] === "(" || /^[\w.]/.test(reste.slice(debut[0].length))) return null;
    const ref = (m: RegExpExecArray): Reference => ({
      feuille,
      ligne: this.coordonneeA1(m[3] ?? "", Number(m[4]), "ligne"),
      colonne: this.coordonneeA1(m[1] ?? "", lettresEnColonne(m[2] ?? ""), "colonne"),
    });
    const suite = reste.slice(debut[0].length);
    const fin = suite.startsWith(":") ? CELLULE_A1.exec(suite.slice(1)) : null;
    this.position += longueur + debut[0].length + (fin ? fin[0].length + 1 : 0);
    if (fin) return { k: "plage", debut: ref(debut), fin: ref(fin), mode: "cellules" };
    return { k: "cellule", ref: ref(debut) };
  }

  suivant(): Jeton {
    while (this.reste.startsWith(" ")) this.position++;
    const reste = this.reste;
    if (reste === "") return { genre: "fin" };
    const c = reste[0] ?? "";
    const local = this.syntaxe === "local";
    const separateur = local ? ";" : ",";

    if (c === separateur) {
      this.position++;
      return { genre: "separateur" };
    }
    if (c === "(") {
      this.position++;
      return { genre: "ouvrante" };
    }
    if (c === ")") {
      this.position++;
      return { genre: "fermante" };
    }
    if (c === '"') {
      let valeur = "";
      let i = 1;
      for (;;) {
        if (i >= reste.length) incorrecte("il manque un guillemet fermant");
        if (reste[i] === '"') {
          if (reste[i + 1] === '"') {
            valeur += '"';
            i += 2;
            continue;
          }
          break;
        }
        valeur += reste[i] ?? "";
        i++;
      }
      this.position += i + 1;
      return { genre: "texte", valeur };
    }
    if (c === "#") {
      const code = [...ERREURS, ...Object.values(ERREURS_LOCALES)].find((e) =>
        reste.toUpperCase().startsWith(e),
      );
      if (!code) incorrecte(`erreur inconnue « ${reste.slice(0, 8)} »`);
      this.position += code.length;
      const anglais = Object.entries(ERREURS_LOCALES).find(([, l]) => l === code)?.[0] ?? code;
      return { genre: "erreur", code: anglais };
    }
    const reference = this.reference();
    if (reference) return { genre: "ref", noeud: reference };

    const decimale = local ? "," : ".";
    const nombre = new RegExp(`^(\\d+(\\${decimale}\\d*)?|\\${decimale}\\d+)([eE][+-]?\\d+)?`).exec(
      reste,
    );
    if (nombre) {
      this.position += nombre[0].length;
      return { genre: "nombre", valeur: Number(nombre[0].replace(",", ".")) };
    }
    const nom = /^[A-Za-z_À-ɏ][\w.À-ɏ]*/.exec(reste);
    if (nom) {
      this.position += nom[0].length;
      while (this.reste.startsWith(" ")) this.position++;
      if (this.reste.startsWith("(")) return { genre: "fonction", nom: nom[0].toUpperCase() };
      return { genre: "nom", nom: nom[0] };
    }
    const double = reste.slice(0, 2);
    if (["<>", "<=", ">="].includes(double)) {
      this.position += 2;
      return { genre: "op", texte: double };
    }
    if ("+-*/^&=<>%".includes(c)) {
      this.position++;
      return { genre: "op", texte: c };
    }
    if (c === ";" || c === ",") {
      incorrecte(
        local
          ? "avec FormulaLocal, sépare les arguments par des points-virgules : =SOMME(A1;B1)"
          : "avec Formula, écris la formule en anglais, arguments séparés par des virgules : =SUM(A1,B1). En français, utilise FormulaLocal",
      );
    }
    return incorrecte(`caractère inattendu « ${c} »`);
  }
}

class Analyseur {
  private readonly lecteur: Lecteur;
  private jeton: Jeton;
  private readonly syntaxe: Syntaxe;

  constructor(texte: string, syntaxe: Syntaxe, hote: Hote) {
    this.lecteur = new Lecteur(texte, syntaxe, hote);
    this.syntaxe = syntaxe;
    this.jeton = this.lecteur.suivant();
  }

  private avancer(): void {
    this.jeton = this.lecteur.suivant();
  }

  /** Le jeton courant (une méthode : TypeScript ne le croit pas figé après avancer()). */
  private courant(): Jeton {
    return this.jeton;
  }

  private estOp(...ops: string[]): string | null {
    return this.jeton.genre === "op" && ops.includes(this.jeton.texte) ? this.jeton.texte : null;
  }

  formule(): NoeudFormule {
    const noeud = this.comparaison();
    if (this.jeton.genre !== "fin") incorrecte("la formule continue après la fin attendue");
    return noeud;
  }

  private binaires(ops: string[], suivant: () => NoeudFormule): NoeudFormule {
    let gauche = suivant();
    for (let op = this.estOp(...ops); op; op = this.estOp(...ops)) {
      this.avancer();
      gauche = { k: "binaire", op, gauche, droite: suivant() };
    }
    return gauche;
  }

  private comparaison(): NoeudFormule {
    return this.binaires(["=", "<>", "<", ">", "<=", ">="], () => this.concatenation());
  }

  private concatenation(): NoeudFormule {
    return this.binaires(["&"], () => this.additif());
  }

  private additif(): NoeudFormule {
    return this.binaires(["+", "-"], () => this.multiplicatif());
  }

  private multiplicatif(): NoeudFormule {
    return this.binaires(["*", "/"], () => this.puissance());
  }

  private puissance(): NoeudFormule {
    return this.binaires(["^"], () => this.pourcentage());
  }

  private pourcentage(): NoeudFormule {
    let expr = this.unaire();
    while (this.estOp("%")) {
      this.avancer();
      expr = { k: "unaire", op: "%", expr };
    }
    return expr;
  }

  /** Dans Excel, le signe passe avant la puissance : =-2^2 vaut 4. */
  private unaire(): NoeudFormule {
    const op = this.estOp("-", "+");
    if (op === "-" || op === "+") {
      this.avancer();
      return { k: "unaire", op, expr: this.unaire() };
    }
    return this.primaire();
  }

  private primaire(): NoeudFormule {
    const jeton = this.jeton;
    switch (jeton.genre) {
      case "nombre":
        this.avancer();
        return { k: "nombre", valeur: jeton.valeur };
      case "texte":
        this.avancer();
        return { k: "texte", valeur: jeton.valeur };
      case "erreur":
        this.avancer();
        return { k: "erreur", code: jeton.code };
      case "ref":
        this.avancer();
        return jeton.noeud;
      case "ouvrante": {
        this.avancer();
        const expr = this.comparaison();
        if (this.jeton.genre !== "fermante") incorrecte("il manque une parenthèse fermante");
        this.avancer();
        return { k: "paren", expr };
      }
      case "fonction":
        return this.fonction(jeton.nom);
      case "nom": {
        this.avancer();
        const nom = jeton.nom.toUpperCase();
        if (nom === "TRUE" || nom === "VRAI") return { k: "booleen", valeur: true };
        if (nom === "FALSE" || nom === "FAUX") return { k: "booleen", valeur: false };
        return { k: "nom", nom: jeton.nom };
      }
      case "fin":
        return incorrecte("la formule s'arrête trop tôt");
      default:
        return incorrecte("expression attendue");
    }
  }

  private fonction(nomLu: string): NoeudFormule {
    const nom = this.syntaxe === "local" ? (NOMS_ANGLAIS[nomLu] ?? nomLu) : nomLu;
    this.avancer();
    if (this.courant().genre !== "ouvrante") incorrecte(`« ( » attendue après ${nomLu}`);
    this.avancer();
    const args: NoeudFormule[] = [];
    if (this.courant().genre === "fermante") {
      this.avancer();
      return { k: "fonction", nom, args };
    }
    for (;;) {
      const jeton = this.courant();
      if (jeton.genre === "separateur" || jeton.genre === "fermante") args.push({ k: "vide" });
      else args.push(this.comparaison());
      const apres = this.courant();
      if (apres.genre === "separateur") {
        this.avancer();
        continue;
      }
      if (apres.genre === "fermante") {
        this.avancer();
        return { k: "fonction", nom, args };
      }
      return incorrecte(`il manque une parenthèse fermante après ${nomLu}`);
    }
  }
}

/** Lit une formule, sans son « = » de tête. Lève l'erreur 1004 si elle est incorrecte. */
export function analyserFormule(texte: string, syntaxe: Syntaxe, hote: Hote): NoeudFormule {
  if (texte.trim() === "") incorrecte("la formule est vide");
  return new Analyseur(texte, syntaxe, hote).formule();
}

// ——— Écriture ———

function lettres(colonne: number): string {
  let resultat = "";
  let n = colonne;
  while (n > 0) {
    resultat = String.fromCharCode(65 + ((n - 1) % 26)) + resultat;
    n = Math.floor((n - 1) / 26);
  }
  return resultat;
}

/** La position réelle d'une coordonnée, vue depuis la cellule de la formule. */
export function position(coordonnee: Coordonnee, base: number): number {
  return coordonnee.absolue ? coordonnee.valeur : base + coordonnee.valeur;
}

function prefixeFeuille(feuille: string | null): string {
  if (feuille === null) return "";
  return /^[A-Za-z_À-ɏ][\w.À-ɏ]*$/.test(feuille)
    ? `${feuille}!`
    : `'${feuille.replace(/'/g, "''")}'!`;
}

function referenceA1(
  ref: Reference,
  hote: Hote,
  partie: "tout" | "ligne" | "colonne",
): string | null {
  const ligne = position(ref.ligne, hote.ligne);
  const colonne = position(ref.colonne, hote.colonne);
  if (ligne < 1 || ligne > MAX_LIGNES || colonne < 1 || colonne > MAX_COLONNES) return null;
  const l = `${ref.ligne.absolue ? "$" : ""}${String(ligne)}`;
  const c = `${ref.colonne.absolue ? "$" : ""}${lettres(colonne)}`;
  if (partie === "ligne") return l;
  if (partie === "colonne") return c;
  return c + l;
}

function coordonneeR1C1(lettre: string, coordonnee: Coordonnee): string {
  if (coordonnee.absolue) return lettre + String(coordonnee.valeur);
  return coordonnee.valeur === 0 ? lettre : `${lettre}[${String(coordonnee.valeur)}]`;
}

/** Écrit la formule, « = » compris, dans la syntaxe demandée. */
export function ecrireFormule(noeud: NoeudFormule, syntaxe: Syntaxe, hote: Hote): string {
  return "=" + ecrire(noeud, syntaxe, hote);
}

function ecrire(noeud: NoeudFormule, syntaxe: Syntaxe, hote: Hote): string {
  const local = syntaxe === "local";
  const sous = (n: NoeudFormule) => ecrire(n, syntaxe, hote);
  switch (noeud.k) {
    case "nombre": {
      const texte = String(noeud.valeur).toUpperCase();
      return local ? texte.replace(".", ",") : texte;
    }
    case "texte":
      return `"${noeud.valeur.replace(/"/g, '""')}"`;
    case "booleen":
      if (local) return noeud.valeur ? "VRAI" : "FAUX";
      return noeud.valeur ? "TRUE" : "FALSE";
    case "erreur":
      return local ? (ERREURS_LOCALES[noeud.code] ?? noeud.code) : noeud.code;
    case "vide":
      return "";
    case "nom":
      return noeud.nom;
    case "cellule": {
      if (syntaxe === "r1c1") {
        const { ref } = noeud;
        return (
          prefixeFeuille(ref.feuille) +
          coordonneeR1C1("R", ref.ligne) +
          coordonneeR1C1("C", ref.colonne)
        );
      }
      const texte = referenceA1(noeud.ref, hote, "tout");
      return texte === null ? "#REF!" : prefixeFeuille(noeud.ref.feuille) + texte;
    }
    case "plage": {
      const { debut, fin, mode } = noeud;
      if (syntaxe === "r1c1") {
        const r = (ref: Reference) =>
          coordonneeR1C1("R", ref.ligne) + coordonneeR1C1("C", ref.colonne);
        return `${prefixeFeuille(debut.feuille)}${r(debut)}:${r(fin)}`;
      }
      const partie = mode === "colonnes" ? "colonne" : mode === "lignes" ? "ligne" : "tout";
      const a = referenceA1(debut, hote, partie);
      const b = referenceA1(fin, hote, partie);
      if (a === null || b === null) return "#REF!";
      return `${prefixeFeuille(debut.feuille)}${a}:${b}`;
    }
    case "fonction": {
      const nom = local ? (NOMS_LOCAUX[noeud.nom] ?? noeud.nom) : noeud.nom;
      return `${nom}(${noeud.args.map(sous).join(local ? ";" : ",")})`;
    }
    case "unaire":
      return noeud.op === "%" ? `${sous(noeud.expr)}%` : `${noeud.op}${sous(noeud.expr)}`;
    case "binaire":
      return `${sous(noeud.gauche)}${noeud.op}${sous(noeud.droite)}`;
    case "paren":
      return `(${sous(noeud.expr)})`;
  }
}
