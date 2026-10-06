/** Découpe le code VBA en jetons. VBA ne distingue pas les majuscules des minuscules. */
import { dateDepuisParties, type DateVba, ErreurCompilation } from "./valeurs";

export type Jeton =
  /** `nom` est en minuscules, sans suffixe de type (Left$ → left). */
  | { genre: "mot"; texte: string; nom: string; ligne: number }
  | { genre: "nombre"; valeur: number; ligne: number }
  | { genre: "chaine"; valeur: string; ligne: number }
  | { genre: "date"; valeur: DateVba; ligne: number }
  | { genre: "symbole"; texte: string; ligne: number }
  /** Fin de ligne. Les deux-points qui séparent deux instructions sont des symboles. */
  | { genre: "ligne"; ligne: number }
  | { genre: "fin"; ligne: number };

const SYMBOLES_DOUBLES = ["<>", "<=", ">=", ":="];
const SYMBOLES = "(),.;:+-*/\\^&=<>!";
const DEBUT_MOT = /[A-Za-z\u00C0-\u024F]/;
const SUITE_MOT = /[A-Za-z0-9_\u00C0-\u024F]/;
const SUFFIXES = "$%&!#@";

export function decouper(source: string): Jeton[] {
  const jetons: Jeton[] = [];
  let i = 0;
  let ligne = 1;
  const code = source.replace(/\r\n?/g, "\n");

  const debutInstruction = () => {
    const dernier = jetons.at(-1);
    return (
      !dernier ||
      dernier.genre === "ligne" ||
      (dernier.genre === "symbole" && dernier.texte === ":")
    );
  };
  const finDeLigne = () => {
    while (i < code.length && code[i] !== "\n") i++;
  };

  while (i < code.length) {
    const c = code[i] ?? "";

    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "\n") {
      jetons.push({ genre: "ligne", ligne });
      ligne++;
      i++;
      continue;
    }
    if (c === "'") {
      finDeLigne();
      continue;
    }
    // Suite de ligne : « _ » en fin de ligne, précédé d'une espace.
    if (c === "_" && /^[ \t]*(\n|$)/.test(code.slice(i + 1, i + 40))) {
      i++;
      while (code[i] === " " || code[i] === "\t") i++;
      if (code[i] === "\n") {
        i++;
        ligne++;
      }
      continue;
    }
    if (c === '"') {
      let texte = "";
      i++;
      for (;;) {
        if (i >= code.length || code[i] === "\n") {
          throw new ErreurCompilation('Chaîne de caractères non terminée : il manque un "', ligne);
        }
        if (code[i] === '"') {
          if (code[i + 1] === '"') {
            texte += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        texte += code[i] ?? "";
        i++;
      }
      jetons.push({ genre: "chaine", valeur: texte, ligne });
      continue;
    }
    if (c === "#" && /^#[\d/:\- ]+(AM|PM)?#/i.test(code.slice(i, i + 30))) {
      const fin = code.indexOf("#", i + 1);
      jetons.push({
        genre: "date",
        valeur: lireDateLitterale(code.slice(i + 1, fin), ligne),
        ligne,
      });
      i = fin + 1;
      continue;
    }
    if (c === "&" && /[hHoO]/.test(code[i + 1] ?? "") && /[0-9A-Fa-f]/.test(code[i + 2] ?? "")) {
      const base = (code[i + 1] ?? "").toLowerCase() === "h" ? 16 : 8;
      let j = i + 2;
      while (j < code.length && /[0-9A-Fa-f]/.test(code[j] ?? "")) j++;
      jetons.push({ genre: "nombre", valeur: parseInt(code.slice(i + 2, j), base), ligne });
      i = j;
      if (code[i] === "&" || code[i] === "%") i++;
      continue;
    }
    const precedent = jetons.at(-1);
    const apresValeur =
      precedent !== undefined &&
      (precedent.genre === "mot" ||
        precedent.genre === "nombre" ||
        (precedent.genre === "symbole" && precedent.texte === ")"));
    if (/\d/.test(c) || (c === "." && /\d/.test(code[i + 1] ?? "") && !apresValeur)) {
      const nombre = /^(\d*\.?\d+|\d+\.)([eE][+-]?\d+)?/.exec(code.slice(i));
      const texte = nombre?.[0] ?? c;
      jetons.push({ genre: "nombre", valeur: Number(texte), ligne });
      i += texte.length;
      if (SUFFIXES.includes(code[i] ?? "") && code[i] !== "$") i++;
      continue;
    }
    if (DEBUT_MOT.test(c)) {
      let j = i + 1;
      while (j < code.length && SUITE_MOT.test(code[j] ?? "")) j++;
      const texte = code.slice(i, j);
      i = j;
      // Suffixe de type collé au nom : Left$, total%, x#.
      if (SUFFIXES.includes(code[i] ?? "") && !SUITE_MOT.test(code[i + 1] ?? "")) i++;
      const nom = texte.toLowerCase();
      if (nom === "rem" && debutInstruction()) {
        finDeLigne();
        continue;
      }
      jetons.push({ genre: "mot", texte, nom, ligne });
      continue;
    }
    const double = code.slice(i, i + 2);
    if (SYMBOLES_DOUBLES.includes(double)) {
      jetons.push({ genre: "symbole", texte: double, ligne });
      i += 2;
      continue;
    }
    if (SYMBOLES.includes(c)) {
      jetons.push({ genre: "symbole", texte: c, ligne });
      i++;
      continue;
    }
    throw new ErreurCompilation(`Caractère inattendu : « ${c} »`, ligne);
  }
  jetons.push({ genre: "ligne", ligne });
  jetons.push({ genre: "fin", ligne });
  return jetons;
}

/** Une date littérale s'écrit à l'américaine : #12/31/2024#, ou #2024-12-31#. */
function lireDateLitterale(texte: string, ligne: number): DateVba {
  const iso = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(texte);
  if (iso) {
    const [, a = "", m = "", j = ""] = iso;
    return dateDepuisParties(Number(a), Number(m), Number(j));
  }
  const us =
    /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?\s*$/i.exec(
      texte,
    );
  if (us) {
    const [, m = "", j = "", a = "", h = "0", mi = "0", s = "0", ampm] = us;
    let heures = Number(h);
    if (ampm?.toUpperCase() === "PM" && heures < 12) heures += 12;
    if (ampm?.toUpperCase() === "AM" && heures === 12) heures = 0;
    return dateDepuisParties(Number(a), Number(m), Number(j), heures, Number(mi), Number(s));
  }
  throw new ErreurCompilation(`Date incorrecte : #${texte}#`, ligne);
}
