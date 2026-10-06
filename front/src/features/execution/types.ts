/** Langages exécutables dans le navigateur (ADR 0009, ADR 0026). */
export type Langage = "python" | "javascript" | "vba";

export const LANGAGES: Record<Langage, string> = {
  python: "Python",
  javascript: "JavaScript",
  vba: "VBA",
};

export function estLangage(valeur: string): valeur is Langage {
  return valeur in LANGAGES;
}

export type Flux = "stdout" | "stderr";

export interface Sortie {
  flux: Flux;
  texte: string;
}

export interface CelluleAffichee {
  texte: string;
  gras: boolean;
  italique: boolean;
  /** Un nombre ou une date : aligné à droite, comme dans Excel. */
  nombre: boolean;
}

/** Une feuille Excel simulée (VBA), telle que le code l'a laissée. */
export interface FeuilleAffichee {
  nom: string;
  /** À partir de A1. Une cellule vide vaut null. */
  lignes: (CelluleAffichee | null)[][];
  /** La feuille dépasse ce qui est affiché. */
  tronquee: boolean;
}

export interface Resultat {
  sorties: Sortie[];
  statut: "ok" | "erreur" | "delai";
  /** La sortie a été coupée parce qu'elle était trop longue. */
  tronque: boolean;
  /** Les feuilles du classeur après un code VBA. */
  feuilles?: FeuilleAffichee[];
}

/** Message envoyé au worker. */
export interface Demande {
  code: string;
}

/** Messages renvoyés par le worker. */
export type Message =
  | { type: "chargement" }
  | { type: "debut" }
  | { type: "sortie"; flux: Flux; texte: string }
  | { type: "feuilles"; feuilles: FeuilleAffichee[] }
  | { type: "fin"; erreur: string | null };
