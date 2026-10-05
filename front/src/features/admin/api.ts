import { appelApi, type Schemas } from "../../api/client";

export type UtilisateurAdmin = Schemas["UtilisateurAdmin"];
export type PageUtilisateurs = Schemas["PageUtilisateurs"];
export type ThemeAdmin = Schemas["ThemeAdmin"];
export type PageJournal = Schemas["PageJournal"];
export type Role = UtilisateurAdmin["role"];

/** Nombre de lignes par page dans les tableaux d'administration. */
export const PAR_PAGE = 50;

export const ROLES: Record<Role, string> = {
  apprenant: "Apprenant",
  contributeur: "Contributeur",
  relecteur: "Relecteur",
  admin: "Administrateur",
};

/** Libellés des actions du journal. Une action inconnue s'affiche telle quelle. */
export const ACTIONS: Record<string, string> = {
  changement_role: "Changement de rôle",
  suspension: "Suspension",
  reactivation: "Réactivation",
  suppression_compte: "Suppression de compte",
  purge_comptes: "Purge des comptes non confirmés",
  import: "Import de leçons",
  soumission: "Soumission à la relecture",
  relecture_publier: "Publication",
  relecture_corriger: "Corrections demandées",
  relecture_refuser: "Refus",
  theme_creation: "Création de thème",
  theme_modification: "Renommage de thème",
  theme_suppression: "Suppression de thème",
};

function parametres(valeurs: Record<string, string | number>) {
  const liste = Object.entries(valeurs)
    .filter(([, valeur]) => valeur !== "")
    .map(([cle, valeur]) => [cle, String(valeur)]);
  return new URLSearchParams(liste).toString();
}

export const adminApi = {
  utilisateurs: (q: string, page: number) =>
    appelApi<PageUtilisateurs>(
      `/admin/utilisateurs?${parametres({ q, limite: PAR_PAGE, decalage: (page - 1) * PAR_PAGE })}`,
    ),
  modifierUtilisateur: (id: string, corps: Schemas["ModificationUtilisateur"]) =>
    appelApi<UtilisateurAdmin>(`/admin/utilisateurs/${encodeURIComponent(id)}`, {
      methode: "PATCH",
      corps,
    }),
  themes: () => appelApi<ThemeAdmin[]>("/admin/themes"),
  creerTheme: (corps: Schemas["NouveauTheme"]) =>
    appelApi<ThemeAdmin>("/admin/themes", { methode: "POST", corps }),
  renommerTheme: (slug: string, nom: string) =>
    appelApi<ThemeAdmin>(`/admin/themes/${encodeURIComponent(slug)}`, {
      methode: "PATCH",
      corps: { nom },
    }),
  supprimerTheme: (slug: string) =>
    appelApi<null>(`/admin/themes/${encodeURIComponent(slug)}`, { methode: "DELETE" }),
  journal: (action: string, page: number) =>
    appelApi<PageJournal>(
      `/admin/journal?${parametres({ action, limite: PAR_PAGE, decalage: (page - 1) * PAR_PAGE })}`,
    ),
};

/** Numéro de page lu dans l'adresse (1 par défaut). */
export function lirePage(valeur: string | null): number {
  const page = Number(valeur);
  return Number.isInteger(page) && page > 1 ? page : 1;
}
