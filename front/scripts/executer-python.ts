/**
 * Exécute un code Python comme la plateforme (Pyodide, mêmes bibliothèques), pour écrire
 * ou vérifier une leçon :
 *
 *   npm run python -- mon-code.py
 *
 * La sortie standard est la `sortie_attendue`. L'erreur éventuelle va sur la sortie d'erreur.
 */
import { readFileSync } from "node:fs";

import { executerCodePython } from "./pyodide-node";

const fichier = process.argv[2];
if (!fichier) {
  process.stderr.write("Usage : npm run python -- mon-code.py\n");
  process.exit(2);
}

const { sortie, erreur } = await executerCodePython(readFileSync(fichier, "utf-8"));
process.stdout.write(sortie);
if (erreur) {
  process.stderr.write(`\n${erreur}\n`);
  process.exitCode = 1;
}
