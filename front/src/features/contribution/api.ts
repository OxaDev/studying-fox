import { appelApi, type Schemas } from "../../api/client";

export type Contribution = Schemas["Contribution"];
export type ElementContribution = Schemas["ElementContribution"];
export type ContenuBrouillon = Schemas["ContenuBrouillon"];
export type Theme = Schemas["ThemeLecture"];

const base = "/contributions";
const id = (revisionId: string) => `${base}/${encodeURIComponent(revisionId)}`;

export const contributionApi = {
  lister: () => appelApi<ElementContribution[]>(base),
  lire: (revisionId: string) => appelApi<Contribution>(id(revisionId)),
  creer: (corps: Schemas["NouvelleLecon"]) =>
    appelApi<Contribution>(base, { methode: "POST", corps }),
  proposerModification: (slug: string) =>
    appelApi<Contribution>(`${base}/depuis/${encodeURIComponent(slug)}`, { methode: "POST" }),
  enregistrer: (revisionId: string, corps: ContenuBrouillon) =>
    appelApi<Contribution>(id(revisionId), { methode: "PUT", corps }),
  soumettre: (revisionId: string, accepteLicence: boolean) =>
    appelApi<Contribution>(`${id(revisionId)}/soumettre`, {
      methode: "POST",
      corps: { accepte_licence: accepteLicence },
    }),
  reprendre: (revisionId: string) =>
    appelApi<Contribution>(`${id(revisionId)}/reprendre`, { methode: "POST" }),
  supprimer: (revisionId: string) => appelApi<null>(id(revisionId), { methode: "DELETE" }),
  themes: () => appelApi<Theme[]>("/lecons/themes"),
};
