import type { Flux } from "./types";

export type Ecrire = (flux: Flux, texte: string) => void;

/** Affiche une valeur comme le ferait la console du navigateur, en plus simple. */
export function formater(valeur: unknown): string {
  if (typeof valeur === "string") return valeur;
  if (valeur instanceof Error) return `${valeur.name}: ${valeur.message}`;
  if (typeof valeur === "object" && valeur !== null) {
    try {
      return JSON.stringify(valeur);
    } catch {
      return Object.prototype.toString.call(valeur);
    }
  }
  return String(valeur);
}

/**
 * Exécute le code d'une leçon. Ne doit tourner que dans un worker isolé (ADR 0009).
 * Renvoie le message d'erreur, ou null si tout s'est bien passé.
 */
export async function executerJavascript(code: string, ecrire: Ecrire): Promise<string | null> {
  const ligne =
    (flux: Flux) =>
    (...valeurs: unknown[]) => {
      ecrire(flux, valeurs.map(formater).join(" ") + "\n");
    };
  const consoleLecon = {
    log: ligne("stdout"),
    info: ligne("stdout"),
    warn: ligne("stderr"),
    error: ligne("stderr"),
  };

  try {
    // Le code est enveloppé dans une fonction async : `await` y est permis.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- c'est le but : exécuter le code de la leçon, dans un worker isolé (ADR 0009)
    const fonction = new Function("console", `return (async () => {\n${code}\n})();`) as (
      console: typeof consoleLecon,
    ) => Promise<unknown>;
    await fonction(consoleLecon);
    return null;
  } catch (erreur) {
    return formater(erreur);
  }
}
