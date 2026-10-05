import { appelApi, envoyerFichier, type Schemas } from "../../api/client";

export type ElementFile = Schemas["ElementFile"];
export type RevisionARelire = Schemas["RevisionARelire"];
export type ResultatAnalyse = Schemas["ResultatAnalyse"];
export type ResultatImport = Schemas["ResultatImport"];
export type CodeAVerifier = Schemas["CodeAVerifier"];
export type Decision = Schemas["DemandeDecision"]["decision"];
export type Statut = RevisionARelire["statut"];

export const STATUTS: Record<Statut, string> = {
  brouillon: "Brouillon",
  en_relecture: "En relecture",
  a_corriger: "À corriger",
  publiee: "Publiée",
  refusee: "Refusée",
};

export const DECISIONS: Record<Decision, string> = {
  publier: "Publier",
  corriger: "Demander des corrections",
  refuser: "Refuser",
};

export const relectureApi = {
  file: () => appelApi<ElementFile[]>("/relecture"),
  lire: (id: string) => appelApi<RevisionARelire>(`/relecture/${encodeURIComponent(id)}`),
  decider: (id: string, corps: Schemas["DemandeDecision"]) =>
    appelApi<RevisionARelire>(`/relecture/${encodeURIComponent(id)}/decision`, {
      methode: "POST",
      corps,
    }),
  deciderEnGroupe: (corps: Schemas["DemandeDecisionGroupee"]) =>
    appelApi<Schemas["ResultatDecisionGroupee"]>("/relecture/decisions", {
      methode: "POST",
      corps,
    }),
  analyser: (fichier: File) => envoyerFichier<ResultatAnalyse>("/imports/analyse", fichier),
  importer: (fichier: File) => envoyerFichier<Schemas["ResultatImport"]>("/imports", fichier),
};
