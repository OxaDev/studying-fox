/**
 * Adresses du site. Il peut être servi sous un chemin du domaine, comme
 * « https://exemple.fr/studying-fox » (ADR 0031) : toute adresse absolue passe par ici.
 */

/** « /studying-fox/app/ » → « /studying-fox ». Vide quand le site est à la racine du domaine. */
export function cheminDuSite(baseApp: string): string {
  return baseApp.replace(/\/app\/$/, "");
}

/** Chemin du site, déduit de `base` dans la config de Vite (`RENARD_CHEMIN_BASE`). */
export const CHEMIN_SITE = cheminDuSite(import.meta.env.BASE_URL);

/** Application React (ADR 0020). */
export const BASE_APP = `${CHEMIN_SITE}/app`;

/** API REST (ADR 0020). */
export const BASE_API = `${CHEMIN_SITE}/api`;

/**
 * Les images importées sont enregistrées dans le Markdown sous « /medias/… » :
 * on leur ajoute le chemin du site à l'affichage.
 */
export function adresseMedia(url: string, chemin = CHEMIN_SITE): string {
  return url.startsWith("/medias/") ? `${chemin}${url}` : url;
}
