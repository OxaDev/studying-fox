/**
 * La fonction Format de VBA, et le format des nombres des cellules (NumberFormat).
 * Réglages français : virgule décimale, espace entre les milliers, noms de jours et de mois.
 */
import {
  DateVba,
  enDate,
  ErreurExcel,
  enNombre,
  enTexte,
  estNumerique,
  formaterDate,
  formaterNombre,
  lireDate,
  partiesDate,
  simple,
  type Valeur,
} from "./valeurs";

export const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const NOMMES: Record<string, string> = {
  "general number": "0.##############",
  fixed: "0.00",
  standard: "#,##0.00",
  percent: "0.00%",
  currency: "#,##0.00 €",
  scientific: "0.00E+00",
};

const FORMATS_DATE: Record<string, string> = {
  "short date": "dd/mm/yyyy",
  "long date": "dddd d mmmm yyyy",
  "medium date": "dd-mmm-yy",
  "general date": "",
  "short time": "hh:nn",
  "medium time": "hh:nn AM/PM",
  "long time": "hh:nn:ss",
};

/** Format(valeur, motif) */
export function formater(valeur: Valeur, motif: string): string {
  const v = simple(valeur);
  if (motif === "") return v === null ? "" : enTexte(v);
  const nom = motif.toLowerCase();
  if (nom === "yes/no") return enNombre(v) !== 0 ? "Oui" : "Non";
  if (nom === "true/false") return enNombre(v) !== 0 ? "Vrai" : "Faux";
  if (nom === "on/off") return enNombre(v) !== 0 ? "Actif" : "Inactif";
  const formatDate = FORMATS_DATE[nom];
  if (formatDate !== undefined) {
    const date = enDate(v);
    return formatDate === "" ? formaterDate(date) : formaterMotifDate(date, formatDate);
  }
  const nomme = NOMMES[nom];
  if (nomme) return formaterMotifNombre(enNombre(v), nomme);

  if (estMotifDate(motif)) {
    if (v instanceof DateVba || typeof v === "number") return formaterMotifDate(enDate(v), motif);
    if (typeof v === "string" && lireDate(v)) return formaterMotifDate(enDate(v), motif);
  }
  if (estNumerique(v) && v !== undefined && /[0#]/.test(motif)) {
    return formaterMotifNombre(enNombre(v), motif);
  }
  if (v instanceof DateVba) return formaterMotifDate(v, motif);
  return enTexte(v);
}

function estMotifDate(motif: string): boolean {
  const sansTexte = motif.replace(/"[^"]*"|\\./g, "");
  return /[dmyhns]/i.test(sansTexte) && !/[0#]/.test(sansTexte);
}

/** Sépare le motif en sections : positif ; négatif ; zéro. */
function sections(motif: string): string[] {
  const resultat: string[] = [];
  let courant = "";
  let entreGuillemets = false;
  for (let i = 0; i < motif.length; i++) {
    const c = motif[i] ?? "";
    if (c === '"') entreGuillemets = !entreGuillemets;
    if (c === "\\" && !entreGuillemets) {
      courant += c + (motif[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === ";" && !entreGuillemets) {
      resultat.push(courant);
      courant = "";
      continue;
    }
    courant += c;
  }
  resultat.push(courant);
  return resultat;
}

export function formaterMotifNombre(nombre: number, motif: string): string {
  const parties = sections(motif);
  let section = parties[0] ?? "";
  let valeur = nombre;
  let signe = nombre < 0 ? "-" : "";
  if (nombre < 0 && parties[1] !== undefined && parties[1] !== "") {
    section = parties[1];
    valeur = -nombre;
    signe = "";
  } else if (nombre === 0 && parties[2] !== undefined && parties[2] !== "") {
    section = parties[2];
  }
  valeur = Math.abs(valeur);

  // Repère les caractères spéciaux hors des textes littéraux.
  const elements: { texte: string; litteral: boolean }[] = [];
  for (let i = 0; i < section.length; i++) {
    const c = section[i] ?? "";
    if (c === '"') {
      const fin = section.indexOf('"', i + 1);
      const texte = fin === -1 ? section.slice(i + 1) : section.slice(i + 1, fin);
      elements.push({ texte, litteral: true });
      i = fin === -1 ? section.length : fin;
    } else if (c === "\\") {
      elements.push({ texte: section[i + 1] ?? "", litteral: true });
      i++;
    } else {
      elements.push({ texte: c, litteral: !"0#.,%E+-".includes(c) || c === "" });
    }
  }
  const brut = elements.map((e) => (e.litteral ? "" : e.texte)).join("");
  if (elements.some((e) => !e.litteral && e.texte === "%")) valeur *= 100;

  const scientifique = /E[+-]/i.test(brut);
  const point = brut.indexOf(".");
  const partieEntiere = (point === -1 ? brut : brut.slice(0, point)).replace(/E[+-].*/i, "");
  const partieDecimale = point === -1 ? "" : brut.slice(point + 1).replace(/E[+-].*/i, "");
  const decimalesMax = (partieDecimale.match(/[0#]/g) ?? []).length;
  const decimalesMin = (partieDecimale.match(/0/g) ?? []).length;
  const chiffresMin = (partieEntiere.match(/0/g) ?? []).length;
  const milliers = /[0#],[0#]/.test(partieEntiere);

  let corps: string;
  if (scientifique) {
    const exposant = valeur === 0 ? 0 : Math.floor(Math.log10(valeur));
    const mantisse = valeur / 10 ** exposant;
    const signeExposant = exposant < 0 ? "-" : "+";
    const chiffresExposant = (brut.split(/E[+-]/i)[1]?.match(/0/g) ?? []).length || 1;
    corps =
      chiffres(mantisse, decimalesMax, decimalesMin, chiffresMin, false) +
      "E" +
      signeExposant +
      String(Math.abs(exposant)).padStart(chiffresExposant, "0");
  } else {
    corps = chiffres(valeur, decimalesMax, decimalesMin, chiffresMin, milliers);
  }
  if (Number(corps.replace(/\s/g, "").replace(",", ".")) === 0) signe = "";

  // Remet le texte autour des chiffres : ce qui précède le premier chiffre, ce qui suit le dernier.
  const premier = elements.findIndex((e) => !e.litteral && /[0#.]/.test(e.texte));
  let dernier = -1;
  elements.forEach((e, index) => {
    if (!e.litteral && /[0#.]/.test(e.texte)) dernier = index;
  });
  const avant = elements
    .slice(0, Math.max(premier, 0))
    .map((e) => e.texte)
    .join("");
  const apres = elements
    .slice(dernier + 1)
    .filter((e) => !/^E[+-]?$|^[+-]$/i.test(e.texte) || e.litteral)
    .map((e) => e.texte)
    .join("");
  return signe + avant + corps + apres;
}

function chiffres(
  valeur: number,
  decimalesMax: number,
  decimalesMin: number,
  chiffresMin: number,
  milliers: boolean,
): string {
  const arrondi = valeur.toFixed(decimalesMax);
  let [entier = "0", decimales = ""] = arrondi.split(".");
  decimales = decimales.replace(/0+$/, "");
  while (decimales.length < decimalesMin) decimales += "0";
  if (entier === "0" && chiffresMin === 0) entier = "";
  entier = entier.padStart(chiffresMin, "0");
  if (milliers) entier = entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return decimales ? `${entier},${decimales}` : entier;
}

export function formaterMotifDate(date: DateVba, motif: string): string {
  const p = partiesDate(date);
  const ampm = /AM\/PM/i.test(motif);
  let resultat = "";
  let i = 0;
  let apresHeure = false;
  while (i < motif.length) {
    const reste = motif.slice(i);
    const c = motif[i] ?? "";
    if (c === '"') {
      const fin = motif.indexOf('"', i + 1);
      resultat += fin === -1 ? motif.slice(i + 1) : motif.slice(i + 1, fin);
      i = fin === -1 ? motif.length : fin + 1;
      continue;
    }
    if (c === "\\") {
      resultat += motif[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (/^AM\/PM/i.test(reste)) {
      resultat += p.heures < 12 ? "AM" : "PM";
      i += 5;
      continue;
    }
    const groupe = /^(d+|m+|y+|h+|n+|s+)/i.exec(reste)?.[0];
    if (!groupe) {
      resultat += c;
      i++;
      continue;
    }
    const lettre = groupe[0]?.toLowerCase() ?? "";
    const n = groupe.length;
    switch (lettre) {
      case "d":
        if (n >= 4) resultat += JOURS[p.jourSemaine - 1] ?? "";
        else if (n === 3) resultat += (JOURS[p.jourSemaine - 1] ?? "").slice(0, 3) + ".";
        else resultat += n === 2 ? deux(p.jour) : String(p.jour);
        break;
      case "m":
        // « m » après une heure désigne les minutes, comme dans Excel.
        if (apresHeure && n <= 2) resultat += n === 2 ? deux(p.minutes) : String(p.minutes);
        else if (n >= 4) resultat += MOIS[p.mois - 1] ?? "";
        else if (n === 3) resultat += (MOIS[p.mois - 1] ?? "").slice(0, 4).replace(/\.?$/, ".");
        else resultat += n === 2 ? deux(p.mois) : String(p.mois);
        break;
      case "y":
        resultat += n <= 2 ? deux(p.annee % 100) : String(p.annee);
        break;
      case "h": {
        const heures = ampm ? p.heures % 12 || 12 : p.heures;
        resultat += n >= 2 ? deux(heures) : String(heures);
        break;
      }
      case "n":
        resultat += n >= 2 ? deux(p.minutes) : String(p.minutes);
        break;
      case "s":
        resultat += n >= 2 ? deux(p.secondes) : String(p.secondes);
        break;
    }
    apresHeure = lettre === "h";
    i += n;
  }
  return resultat;
}

function deux(nombre: number): string {
  return String(nombre).padStart(2, "0");
}

/** Texte d'une cellule, tel qu'Excel l'affiche (propriété Text). */
export function texteCellule(valeur: Valeur, formatNombre: string | null): string {
  if (valeur === undefined || valeur === null) return "";
  if (valeur instanceof ErreurExcel) return valeur.code;
  if (formatNombre && formatNombre.toLowerCase() !== "general" && formatNombre !== "@") {
    if (typeof valeur === "number" || valeur instanceof DateVba)
      return formater(valeur, formatNombre);
  }
  if (typeof valeur === "boolean") return valeur ? "VRAI" : "FAUX";
  if (typeof valeur === "number") return formaterNombre(valeur);
  if (valeur instanceof DateVba) return formaterDate(valeur);
  return enTexte(valeur);
}
