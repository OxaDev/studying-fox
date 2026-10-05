/** Nom de fichier donné au code de la leçon dans les messages d'erreur Python. */
export const FICHIER_LECON = "<lecon>";

/**
 * Retire de la trace d'erreur Python les lignes internes à Pyodide,
 * pour ne montrer à l'apprenant que ce qui concerne son code.
 */
export function nettoyerTraceback(trace: string): string {
  const lignes = trace.trimEnd().split("\n");
  const debut = lignes.findIndex((ligne) => ligne.includes(`File "${FICHIER_LECON}"`));
  if (debut === -1) return lignes.at(-1) ?? trace;
  return ["Traceback (most recent call last):", ...lignes.slice(debut)].join("\n");
}
