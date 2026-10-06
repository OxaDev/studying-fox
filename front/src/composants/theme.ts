/**
 * Thème choisi par la personne : celui de l'appareil, clair ou sombre.
 * Le choix reste dans ce navigateur (ADR 0024) : rien n'est envoyé au serveur.
 * Les couleurs suivent l'attribut `data-theme` de <html> (tokens.css).
 */

export type Theme = "systeme" | "clair" | "sombre";

export const THEMES: Record<Theme, string> = {
  systeme: "Comme mon appareil",
  clair: "Clair",
  sombre: "Sombre",
};

export const CLE_THEME = "renard-theme";

const ATTRIBUT: Record<Theme, string | null> = { systeme: null, clair: "light", sombre: "dark" };

export function estTheme(valeur: string | null): valeur is Theme {
  return valeur !== null && Object.hasOwn(THEMES, valeur);
}

/** Thème enregistré. Stockage indisponible (navigation privée stricte) : celui de l'appareil. */
export function lireTheme(): Theme {
  try {
    const valeur = localStorage.getItem(CLE_THEME);
    return estTheme(valeur) ? valeur : "systeme";
  } catch {
    return "systeme";
  }
}

export function appliquerTheme(theme: Theme) {
  const attribut = ATTRIBUT[theme];
  if (attribut) document.documentElement.dataset.theme = attribut;
  else delete document.documentElement.dataset.theme;
}

/** Applique le thème et le retient pour les prochaines visites. */
export function choisirTheme(theme: Theme) {
  appliquerTheme(theme);
  try {
    if (theme === "systeme") localStorage.removeItem(CLE_THEME);
    else localStorage.setItem(CLE_THEME, theme);
  } catch {
    // Pas de stockage : le choix vaut pour cette page seulement.
  }
}

/** Applique le thème enregistré, et le suit quand il change dans un autre onglet. */
export function initialiserTheme() {
  appliquerTheme(lireTheme());
  window.addEventListener("storage", (evenement) => {
    if (evenement.key === CLE_THEME || evenement.key === null) appliquerTheme(lireTheme());
  });
}
