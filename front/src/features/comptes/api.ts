import { appelApi, type Schemas } from "../../api/client";

export type Moi = Schemas["Moi"];
export type Reglages = Schemas["Reglages"];

const post = <T>(chemin: string, corps?: unknown) =>
  appelApi<T>(`/comptes${chemin}`, { methode: "POST", corps });

export const comptesApi = {
  moi: () => appelApi<Moi>("/comptes/moi"),
  reglages: () => appelApi<Reglages>("/comptes/reglages"),
  connexion: (corps: Schemas["Connexion"]) => post<Moi>("/connexion", corps),
  deconnexion: () => post<null>("/deconnexion"),
  inscription: (corps: Schemas["Inscription"]) => post<null>("/inscription", corps),
  confirmer: (corps: Schemas["JetonRecu"]) => post<null>("/confirmation", corps),
  renvoyerConfirmation: (corps: Schemas["DemandeParEmail"]) =>
    post<null>("/renvoyer-confirmation", corps),
  motDePasseOublie: (corps: Schemas["DemandeParEmail"]) =>
    post<null>("/mot-de-passe-oublie", corps),
  reinitialiser: (corps: Schemas["Reinitialisation"]) => post<null>("/reinitialisation", corps),
  modifierProfil: (corps: Schemas["ModificationProfil"]) =>
    appelApi<Moi>("/comptes/moi", { methode: "PATCH", corps }),
  changerMotDePasse: (corps: Schemas["ChangementMotDePasse"]) =>
    post<null>("/moi/mot-de-passe", corps),
  changerEmail: (corps: Schemas["ChangementEmail"]) => post<null>("/moi/email", corps),
  supprimerCompte: (corps: Schemas["DemandeSuppression"]) => post<null>("/moi/suppression", corps),
};

/** Téléchargement direct par le navigateur : le cookie de session suffit (lecture seule). */
export const ADRESSE_EXPORT = "/api/comptes/moi/export";
