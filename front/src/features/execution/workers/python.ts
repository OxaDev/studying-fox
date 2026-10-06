/**
 * Worker d'exécution Python avec Pyodide (ADR 0009).
 * Pyodide est hébergé chez nous, sous /app/pyodide/ (RGPD, ADR 0014), et chargé au premier usage.
 * Les bibliothèques (SQLAlchemy, FastAPI, Django…) y sont aussi, chargées à la demande (ADR 0028).
 * Sa politique CSP ne l'autorise à charger que ces fichiers (csp.ts).
 */
import type { PyodideAPI } from "pyodide";

import { aDesPaquetsACharger, chargerPaquets, executerPython } from "../lanceurPython";
import { nettoyerTraceback } from "../traceback";
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

  const code = evenement.data.code;
  try {
    if (aDesPaquetsACharger(instance, code)) {
      envoyer({ type: "chargement" });
      await chargerPaquets(instance, code);
    }
  } catch (erreur) {
    // La cause exacte aide à diagnostiquer : fichier absent, empreinte différente, réseau coupé…
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    console.error("Chargement des bibliothèques Python impossible :", erreur);
    envoyer({
      type: "fin",
      erreur: `Impossible de charger les bibliothèques Python. Vérifie ta connexion.\n(${detail})`,
    });
    return;
  }

  envoyer({ type: "debut" });
  try {
    await executerPython(instance, code);
    envoyer({ type: "fin", erreur: null });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    envoyer({ type: "fin", erreur: nettoyerTraceback(message) });
  }
};
