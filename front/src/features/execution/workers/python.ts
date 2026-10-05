/**
 * Worker d'exécution Python avec Pyodide (ADR 0009).
 * Pyodide est hébergé chez nous, sous /app/pyodide/ (RGPD, ADR 0014), et chargé au premier usage.
 * Sa politique CSP ne l'autorise à charger que ces fichiers (csp.ts).
 */
import type { PyodideAPI } from "pyodide";

import { FICHIER_LECON, nettoyerTraceback } from "../traceback";
import type { Demande, Message } from "../types";

function envoyer(message: Message): void {
  self.postMessage(message);
}

let pyodide: Promise<PyodideAPI> | null = null;

async function chargerPyodide(): Promise<PyodideAPI> {
  const adresse = `${import.meta.env.BASE_URL}pyodide/pyodide.mjs`;
  const module = (await import(/* @vite-ignore */ adresse)) as typeof import("pyodide");
  const instance = await module.loadPyodide();
  instance.setStdin({ error: true });
  instance.setStdout({
    batched: (texte) => {
      envoyer({ type: "sortie", flux: "stdout", texte: texte + "\n" });
    },
  });
  instance.setStderr({
    batched: (texte) => {
      envoyer({ type: "sortie", flux: "stderr", texte: texte + "\n" });
    },
  });
  return instance;
}

/**
 * Chaque exécution part d'un espace de noms vide : les exemples restent indépendants.
 * Le code est transmis comme chaîne JSON, qui est aussi une chaîne Python valide.
 */
function lanceur(code: string): string {
  return `exec(compile(${JSON.stringify(code)}, "${FICHIER_LECON}", "exec"), {"__name__": "__main__"})`;
}

self.onmessage = async (evenement: MessageEvent<Demande>) => {
  if (!pyodide) {
    envoyer({ type: "chargement" });
    pyodide = chargerPyodide();
  }
  let instance: PyodideAPI;
  try {
    instance = await pyodide;
  } catch {
    pyodide = null;
    envoyer({ type: "fin", erreur: "Impossible de charger Python. Vérifie ta connexion." });
    return;
  }

  envoyer({ type: "debut" });
  try {
    instance.runPython(lanceur(evenement.data.code));
    envoyer({ type: "fin", erreur: null });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    envoyer({ type: "fin", erreur: nettoyerTraceback(message) });
  }
};
