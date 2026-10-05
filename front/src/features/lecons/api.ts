import { appelApi, type Schemas } from "../../api/client";

export type ResumeLecon = Schemas["ResumeLecon"];
export type LeconPubliee = Schemas["LeconPubliee"];

export const NIVEAUX: Record<ResumeLecon["niveau"], string> = {
  debutant: "Débutant",
  intermediaire: "Intermédiaire",
};

export const leconsApi = {
  lister: () => appelApi<ResumeLecon[]>("/lecons"),
  lire: (slug: string) => appelApi<LeconPubliee>(`/lecons/${encodeURIComponent(slug)}`),
};
