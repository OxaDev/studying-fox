/** Langages exécutables dans le navigateur (ADR 0009). */
export type Langage = "python" | "javascript";

export const LANGAGES: Record<Langage, string> = {
  python: "Python",
  javascript: "JavaScript",
};

export function estLangage(valeur: string): valeur is Langage {
  return valeur in LANGAGES;
}

export type Flux = "stdout" | "stderr";

export interface Sortie {
  flux: Flux;
  texte: string;
}

export interface Resultat {
  sorties: Sortie[];
  statut: "ok" | "erreur" | "delai";
  /** La sortie a été coupée parce qu'elle était trop longue. */
  tronque: boolean;
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
  | { type: "fin"; erreur: string | null };
