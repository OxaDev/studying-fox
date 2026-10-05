import { appelApi, type Schemas } from "../../api/client";

export type Resultats = Schemas["Resultats"];
export type Segment = Schemas["Segment"];
export type TypeResultat = Schemas["TypeResultat"];

export interface Criteres {
  q: string;
  type: TypeResultat | "";
  theme: string;
  niveau: Schemas["Niveau"] | "";
}

export const rechercheApi = {
  chercher: (criteres: Criteres) => {
    const parametres = new URLSearchParams(
      Object.entries(criteres).filter(([, valeur]) => valeur !== ""),
    );
    return appelApi<Resultats>(`/recherche?${parametres.toString()}`);
  },
};

/** Texte sans surlignage, pour les attributs et les fils d'Ariane. */
export function texteBrut(segments: Segment[]): string {
  return segments.map((segment) => segment.texte).join("");
}
