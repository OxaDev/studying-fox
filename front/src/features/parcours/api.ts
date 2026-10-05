import { appelApi, type Schemas } from "../../api/client";

export type ResumeParcours = Schemas["ResumeParcours"];
export type ParcoursDetail = Schemas["ParcoursDetail"];
export type Espace = Schemas["Espace"];

export const parcoursApi = {
  lister: () => appelApi<ResumeParcours[]>("/parcours"),
  lire: (slug: string) => appelApi<ParcoursDetail>(`/parcours/${encodeURIComponent(slug)}`),
  espace: () => appelApi<Espace>("/progression"),
  terminer: (slug: string) =>
    appelApi<null>(`/progression/lecons/${encodeURIComponent(slug)}`, { methode: "PUT" }),
  reprendre: (slug: string) =>
    appelApi<null>(`/progression/lecons/${encodeURIComponent(slug)}`, { methode: "DELETE" }),
};

/** Clés de cache à rafraîchir quand l'avancement change. */
export const CLES_AVANCEMENT = [["lecons"], ["parcours"], ["progression"]] as const;
