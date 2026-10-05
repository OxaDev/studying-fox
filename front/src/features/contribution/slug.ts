/** Identifiant d'adresse à partir d'un titre : « Les boucles for » → « les-boucles-for ». */
export function versSlug(titre: string): string {
  return titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export const MOTIF_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
