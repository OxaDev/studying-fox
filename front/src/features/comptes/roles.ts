import type { Moi } from "./api";

type Role = Moi["role"];

// Du moins au plus élevé : chaque rôle a les droits des précédents (cadrage § 4).
const ORDRE: Role[] = ["apprenant", "contributeur", "relecteur", "admin"];

/** Vrai si `role` a au moins les droits de `minimum`. Simple confort d'affichage :
 * c'est l'API qui vérifie réellement les droits (CLAUDE.md). */
export function aLeRole(role: Role, minimum: Role): boolean {
  return ORDRE.indexOf(role) >= ORDRE.indexOf(minimum);
}
