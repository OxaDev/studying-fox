/**
 * Contrôle d'une illustration (ADR 0029) : le même que celui de l'API, sur la même liste blanche.
 * Il refait le travail à l'affichage, car le Markdown d'une leçon peut aussi venir de l'éditeur.
 *
 * Le module n'utilise pas les types du DOM : les scripts Node (vérification des paquets)
 * l'appellent avec le DOMParser de jsdom, le navigateur avec le sien.
 */
import regles from "./regles.json";

const NS_SVG = "http://www.w3.org/2000/svg";
const NS_XMLNS = "http://www.w3.org/2000/xmlns/";
const NOEUD_ELEMENT = 1;
const NOEUD_TEXTE = 3;
const NOEUD_CDATA = 4;

const ELEMENTS = new Set(regles.elements);
const AVEC_TEXTE = new Set(regles.avec_texte);
/** Attribut → genre de valeur : couleur, ou un des formats de la liste blanche. */
const ATTRIBUTS = new Map<string, string>(Object.entries(regles.attributs));
const FORMATS = new Map(
  Object.entries(regles.formats).map(([nom, motif]) => [nom, new RegExp(motif)]),
);
export const COULEURS = [...regles.couleurs.theme, ...regles.couleurs.fixes];
const DOCTYPE = /<!(DOCTYPE|ENTITY)/i;

/** Le strict nécessaire du DOM, fourni par le navigateur ou par jsdom. */
export interface NoeudXml {
  nodeType: number;
  textContent: string | null;
}
export interface AttributXml {
  name: string;
  localName: string;
  namespaceURI: string | null;
  value: string;
}
export interface ElementXml extends NoeudXml {
  localName: string;
  namespaceURI: string | null;
  attributes: ArrayLike<AttributXml>;
  childNodes: ArrayLike<NoeudXml>;
  getAttribute(nom: string): string | null;
}
export interface ParseurXml {
  parseFromString(
    source: string,
    type: "image/svg+xml",
  ): {
    documentElement: ElementXml;
    getElementsByTagName(nom: string): ArrayLike<unknown>;
  };
}

/** L'illustration, réduite à ce que la liste blanche autorise. */
export interface ElementSvg {
  nom: string;
  attributs: [string, string][];
  enfants: (ElementSvg | string)[];
}

export type Analyse =
  | { valide: true; svg: ElementSvg; titre: string; description: string }
  | { valide: false; erreurs: string[] };

function correspond(format: string, valeur: string): boolean {
  return FORMATS.get(format)?.test(valeur) ?? false;
}

function erreurDeValeur(attribut: string, valeur: string): string | null {
  const genre = ATTRIBUTS.get(attribut);
  if (genre === "couleur") {
    if (COULEURS.includes(valeur) || valeur === "none" || correspond("url", valeur)) return null;
    return (
      `Couleur « ${valeur} » non autorisée dans « ${attribut} ». ` +
      `Couleurs possibles : ${COULEURS.join(", ")}, none, ou url(#id) pour un dégradé.`
    );
  }
  if (genre && correspond(genre, valeur)) return null;
  return `Valeur « ${valeur} » non autorisée pour « ${attribut} ».`;
}

function estElement(noeud: NoeudXml): noeud is ElementXml {
  return noeud.nodeType === NOEUD_ELEMENT;
}

class Controle {
  erreurs: string[] = [];
  elements = 0;
  titre: string | null = null;
  description: string | null = null;
  titres = 0;
  descriptions = 0;

  element(element: ElementXml, parent: string | null): ElementSvg | null {
    const nom = element.localName;
    if (element.namespaceURI !== null && element.namespaceURI !== NS_SVG) {
      this.erreurs.push(`Élément <${nom}> d'un espace de noms non autorisé.`);
      return null;
    }
    if (!ELEMENTS.has(nom)) {
      this.erreurs.push(`Élément <${nom}> non autorisé.`);
      return null;
    }
    this.elements++;
    if (nom === "svg" && parent !== null) {
      this.erreurs.push("Un <svg> ne peut pas contenir un autre <svg>.");
      return null;
    }
    if (nom === "title" || nom === "desc") {
      if (parent !== "svg") {
        this.erreurs.push("<title> et <desc> se placent directement dans <svg>.");
      }
      if (nom === "title") {
        this.titres++;
        this.titre = element.textContent?.trim() ?? "";
      } else {
        this.descriptions++;
        this.description = element.textContent?.trim() ?? "";
      }
    }

    const attributs: [string, string][] = [];
    for (const attribut of Array.from(element.attributes)) {
      // Les déclarations d'espace de noms (xmlns, xmlns:xlink) ne sont pas des attributs.
      if (attribut.namespaceURI === NS_XMLNS) continue;
      if (attribut.namespaceURI !== null) {
        this.erreurs.push(
          `Attribut « ${attribut.localName} » avec un préfixe non autorisé sur <${nom}>.`,
        );
      } else if (!ATTRIBUTS.has(attribut.name)) {
        this.erreurs.push(`Attribut « ${attribut.name} » non autorisé sur <${nom}>.`);
      } else {
        const erreur = erreurDeValeur(attribut.name, attribut.value);
        if (erreur) this.erreurs.push(erreur);
        else attributs.push([attribut.name, attribut.value]);
      }
    }

    const enfants: (ElementSvg | string)[] = [];
    for (const enfant of Array.from(element.childNodes)) {
      if (estElement(enfant)) {
        const controle = this.element(enfant, nom);
        if (controle) enfants.push(controle);
      } else if (enfant.nodeType === NOEUD_TEXTE || enfant.nodeType === NOEUD_CDATA) {
        const texte = enfant.textContent ?? "";
        if (AVEC_TEXTE.has(nom)) enfants.push(texte);
        else if (texte.trim()) {
          this.erreurs.push(`Texte hors d'un élément <text> : « ${texte.trim().slice(0, 40)} ».`);
        }
      }
      // Les commentaires et instructions de traitement sont ignorés.
    }
    return { nom, attributs, enfants };
  }
}

/** Contrôle le SVG d'une illustration, avec son <title> et son <desc> (forme du Markdown). */
export function analyserSvg(source: string, parseur: ParseurXml): Analyse {
  if (source.length > regles.taille_max) {
    return {
      valide: false,
      erreurs: [`L'illustration dépasse ${String(regles.taille_max)} caractères.`],
    };
  }
  if (DOCTYPE.test(source)) {
    return { valide: false, erreurs: ["Pas de DOCTYPE ni d'entité dans une illustration."] };
  }
  const document = parseur.parseFromString(source, "image/svg+xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    return { valide: false, erreurs: ["SVG illisible : le XML est mal formé."] };
  }
  const racine = document.documentElement;
  if (racine.namespaceURI !== null && racine.namespaceURI !== NS_SVG) {
    return {
      valide: false,
      erreurs: [`Élément <${racine.localName}> d'un espace de noms non autorisé.`],
    };
  }
  if (racine.localName !== "svg") {
    return { valide: false, erreurs: ["L'illustration doit commencer par <svg>."] };
  }

  const controle = new Controle();
  const svg = controle.element(racine, null);
  const { erreurs } = controle;
  if (racine.getAttribute("viewBox") === null) {
    erreurs.push("<svg> doit avoir un attribut viewBox.");
  }
  if (controle.elements > regles.elements_max) {
    erreurs.push(`Plus de ${String(regles.elements_max)} éléments.`);
  }
  if (controle.titres > 1 || controle.descriptions > 1) {
    erreurs.push("Un seul <title> et un seul <desc>.");
  }
  if (controle.titres === 0) erreurs.push("Il manque le <title> (texte alternatif).");
  if (controle.descriptions === 0) erreurs.push("Il manque le <desc> (description).");
  if (erreurs.length > 0 || !svg) return { valide: false, erreurs };
  return {
    valide: true,
    svg,
    titre: controle.titre ?? "",
    description: controle.description ?? "",
  };
}

function echapper(texte: string): string {
  return texte.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Ajoute le <title> et le <desc> au début du SVG d'un paquet, comme la conversion de l'API
 * (`svg_complet` dans api/app/imports/illustration.py).
 */
export function svgComplet(svg: string, alt: string, description: string): string {
  const ajout = `<title>${echapper(alt)}</title><desc>${echapper(description)}</desc>`;
  const ouverture = /<svg(\s[^>]*)?>/.exec(svg);
  if (!ouverture) return svg;
  const balise = ouverture[0];
  const remplacement = balise.endsWith("/>")
    ? `${balise.slice(0, -2).trimEnd()}>${ajout}</svg>`
    : balise + ajout;
  return svg.slice(0, ouverture.index) + remplacement + svg.slice(ouverture.index + balise.length);
}
