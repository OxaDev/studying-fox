/** Pyodide dans Node, avec les mêmes fichiers et le même lanceur que le navigateur (ADR 0028). */
import { fileURLToPath } from "node:url";

import { loadPyodide, type PyodideAPI } from "pyodide";

import {
  aDesPaquetsACharger,
  chargerPaquets,
  executerPython,
} from "../src/features/execution/lanceurPython";
import { nettoyerTraceback } from "../src/features/execution/traceback";

const DOSSIER = fileURLToPath(new URL("../public/pyodide/", import.meta.url));

export interface ExecutionPython {
  sortie: string;
  erreur: string | null;
}

let instance: Promise<PyodideAPI> | null = null;
let sortie = "";

function pyodide(): Promise<PyodideAPI> {
  instance ??= loadPyodide({ indexURL: DOSSIER }).then((p) => {
    p.setStdin({ error: true });
    p.setStdout({ batched: (texte) => (sortie += texte + "\n") });
    p.setStderr({ batched: (texte) => process.stderr.write(texte + "\n") });
    return p;
  });
  return instance;
}

/** Exécute un code Python comme une leçon. Les exécutions partagent l'interpréteur, comme dans une page. */
export async function executerCodePython(code: string): Promise<ExecutionPython> {
  const p = await pyodide();
  sortie = "";
  try {
    // Le même chemin que le worker du navigateur (workers/python.ts).
    if (aDesPaquetsACharger(p, code)) await chargerPaquets(p, code);
    await executerPython(p, code);
    return { sortie, erreur: null };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    return { sortie, erreur: nettoyerTraceback(message) };
  }
}
